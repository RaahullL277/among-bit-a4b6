import type { PrismaClient } from '@prisma/client';
import { ValidationError, type TenantContext } from '../context.js';
import type { AuthService } from './auth.service.js';
import type { ApiKeyService } from './api-key.service.js';
import type { StoreService } from './store.service.js';
import type { ProductService } from './product.service.js';
import type { IntegrationService } from './integration.service.js';
import type { PageService } from './page.service.js';

export interface CreateAccountInput {
  businessName: string;
  ownerEmail: string;
  ownerName?: string;
}

export interface LaunchProductInput {
  title: string;
  description?: string;
  priceMinor: number;
  costMinor?: number;
  inventory?: number;
}

export interface LaunchStoreInput {
  name: string;
  currency?: string;
  country?: string;
  tagline?: string;
  brandColor?: string;
  accentColor?: string;
  products?: LaunchProductInput[];
  /** Publish the storefront immediately (default true). */
  publish?: boolean;
}

/**
 * Zero-to-store onboarding for the agentic connector: bootstrap a workspace
 * (tenant + owner + API key) for a brand-new user, and stand up a *launched*
 * store in one call — store + a working (stubbed) payment provider + active
 * products + a published storefront home page + theme — returning the live
 * storefront URL. Pure orchestration over the existing services, so humans,
 * agents, and partners all get the identical result.
 */
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auth: AuthService,
    private readonly apiKeys: ApiKeyService,
    private readonly stores: StoreService,
    private readonly products: ProductService,
    private readonly integrations: IntegrationService,
    private readonly pages: PageService,
  ) {}

  /** Create a brand-new merchant workspace and return an API key to connect with. */
  async createAccount(input: CreateAccountInput) {
    if (!input.businessName?.trim()) throw new ValidationError('A business name is required.');
    const session = await this.auth.signup({
      email: input.ownerEmail,
      name: input.ownerName,
      tenantName: input.businessName,
    });
    const ctx: TenantContext = { tenantId: session.tenantId };
    const key = await this.apiKeys.create(ctx, { name: 'connector', scopes: ['*'] });
    return {
      tenantId: session.tenantId,
      ownerEmail: session.user.email,
      apiKey: key.raw,
      message:
        'Workspace created. Set this apiKey as the connector credential (ACP_API_KEY / Authorization) to manage this store, or keep building in this session.',
    };
  }

  private storefrontUrl(storeId: string) {
    const base = (process.env.STOREFRONT_URL ?? 'http://localhost:5174').replace(/\/$/, '');
    return `${base}/?store=${storeId}`;
  }

  /**
   * Build AND launch a complete, shoppable store in one call. Works for a
   * merchant on their own tenant, or a partner via a delegated client context.
   */
  async launchStore(ctx: TenantContext, input: LaunchStoreInput) {
    if (!input.name?.trim()) throw new ValidationError('A store name is required.');

    const store = await this.stores.create(ctx, {
      name: input.name,
      currency: input.currency,
      country: input.country,
    });

    // A stubbed payment provider so checkout works end-to-end immediately.
    await this.integrations
      .configure(ctx, {
        storeId: store.id,
        provider: 'RAZORPAY',
        credentials: { keyId: 'rzp_stub', keySecret: 'stub', webhookSecret: 'stub_webhook_secret' },
      })
      .catch(() => undefined);

    const created: { id: string; title: string }[] = [];
    for (const p of input.products ?? []) {
      const product = await this.products.create(ctx, {
        storeId: store.id,
        title: p.title,
        description: p.description,
        status: 'ACTIVE',
        variants: [{ priceMinor: p.priceMinor, inventory: p.inventory ?? 100, costMinor: p.costMinor }],
      });
      created.push({ id: product.id, title: product.title });
    }

    if (input.brandColor || input.accentColor) {
      await this.pages
        .setTheme(ctx, {
          storeId: store.id,
          primaryColor: input.brandColor,
          accentColor: input.accentColor,
          logoText: input.name,
        })
        .catch(() => undefined);
    }

    const publish = input.publish !== false;
    const page = await this.pages.create(ctx, {
      storeId: store.id,
      slug: 'home',
      title: input.name,
      status: publish ? 'PUBLISHED' : 'DRAFT',
      sections: [
        { id: 'hero', type: 'hero', data: { heading: input.name, subheading: input.tagline ?? '', ctaLabel: 'Shop now', ctaHref: '/' } },
        { id: 'grid', type: 'product_grid', data: { title: 'Featured', mode: 'all' } },
      ],
    });

    return {
      storeId: store.id,
      name: store.name,
      products: created,
      published: page.status === 'PUBLISHED',
      storefrontUrl: this.storefrontUrl(store.id),
      message: publish
        ? 'Store launched. Open the storefront URL to shop it; checkout runs through a stubbed payment provider.'
        : 'Store built as a draft. Publish the home page to go live.',
    };
  }
}
