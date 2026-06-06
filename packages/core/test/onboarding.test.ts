import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { ValidationError, type TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('connector onboarding & launch', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  const tenantIds: string[] = [];

  beforeAll(() => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
  });

  afterAll(async () => {
    for (const id of tenantIds) await prisma.tenant.delete({ where: { id } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('bootstraps a workspace with a usable API key', async () => {
    const email = `owner+${randomBytes(4).toString('hex')}@example.com`;
    const account = await commerce.onboarding.createAccount({ businessName: 'Acme Co', ownerEmail: email });
    tenantIds.push(account.tenantId);
    expect(account.apiKey).toMatch(/^sk_/);
    // The returned key authenticates as that tenant with full permissions.
    const ctx = await commerce.apiKeys.verify(account.apiKey);
    expect(ctx.tenantId).toBe(account.tenantId);
    expect(ctx.actor?.permissions).toContain('products:write');
    // Duplicate email is rejected.
    await expect(commerce.onboarding.createAccount({ businessName: 'X', ownerEmail: email })).rejects.toBeInstanceOf(ValidationError);
  });

  it('launches a complete, shoppable store in one call', async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'Launch Co' } });
    tenantIds.push(tenant.id);
    const ctx: TenantContext = { tenantId: tenant.id };

    const res = await commerce.onboarding.launchStore(ctx, {
      name: 'Launch Store',
      tagline: 'Everything, launched',
      brandColor: '#0f766e',
      products: [
        { title: 'Tee', priceMinor: 50000, inventory: 20, costMinor: 20000 },
        { title: 'Cap', priceMinor: 30000, inventory: 10 },
      ],
    });
    expect(res.published).toBe(true);
    expect(res.products).toHaveLength(2);
    expect(res.storefrontUrl).toContain(`?store=${res.storeId}`);

    // The storefront serves a published home page with the products resolved.
    const page = await commerce.pages.renderPage(res.storeId, 'home');
    expect(page?.title).toBe('Launch Store');
    const grid = page!.sections.find((s: any) => s.type === 'product_grid') as any;
    expect(grid.products.length).toBe(2);

    // It's actually shoppable: the public catalog + a cart checkout work.
    const products = await commerce.storefront.listProducts(res.storeId);
    expect(products.length).toBe(2);
    const variantId = products[0].variants[0].id;
    const cart = await commerce.storefront.createCart(res.storeId, { items: [{ variantId, quantity: 1 }] });
    const { order } = await commerce.storefront.checkout(cart.id);
    expect(order.status).toBe('PENDING');
    expect(order.payment.providerRef).toBeTruthy(); // stub payment provider was configured
  });
});
