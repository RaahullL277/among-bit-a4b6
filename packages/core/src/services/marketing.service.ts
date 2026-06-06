import type { PrismaClient, ProviderName } from '@prisma/client';
import type { TenantContext } from '../context.js';
import { getMarketingProvider } from '../adapters/registry.js';
import type { IntegrationService } from './integration.service.js';

/**
 * Syncs customers and commerce events to a store's enabled marketing-email
 * providers (Klaviyo / Mailchimp / Brevo). All methods are best-effort — a
 * failing ESP must never block a commerce operation.
 */
export class MarketingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly integrations: IntegrationService,
  ) {}

  /** Marketing providers configured and enabled for a store. */
  async enabledProviders(ctx: TenantContext, storeId: string): Promise<ProviderName[]> {
    const rows = await this.prisma.integrationConfig.findMany({
      where: { tenantId: ctx.tenantId, storeId, kind: 'MARKETING', enabled: true },
      select: { provider: true },
    });
    return rows.map((r) => r.provider);
  }

  private async adapterFor(ctx: TenantContext, storeId: string, provider: ProviderName) {
    const creds = await this.integrations.getCredentials(ctx, storeId, provider);
    return { adapter: getMarketingProvider(provider, creds), listId: creds.listId as string | undefined };
  }

  /** Push a customer to every enabled ESP as a contact/subscriber. */
  async syncCustomer(ctx: TenantContext, customerId: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, tenantId: ctx.tenantId } });
    if (!customer?.email) return { synced: 0, reason: 'no_email' as const };
    const providers = await this.enabledProviders(ctx, customer.storeId);
    let synced = 0;
    for (const provider of providers) {
      try {
        const { adapter, listId } = await this.adapterFor(ctx, customer.storeId, provider);
        await adapter.upsertContact({
          email: customer.email,
          name: customer.name ?? undefined,
          phone: customer.phone ?? undefined,
          attributes: { source: 'storefront' },
          listId,
        });
        synced++;
      } catch {
        // best-effort
      }
    }
    return { synced };
  }

  /** Push an order event (and refresh the contact) to every enabled ESP. */
  async trackOrder(ctx: TenantContext, orderId: string, event = 'Placed Order') {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId: ctx.tenantId },
      include: { customer: true },
    });
    const email = order?.customer?.email;
    if (!order || !email) return { tracked: 0, reason: 'no_email' as const };
    const providers = await this.enabledProviders(ctx, order.storeId);
    let tracked = 0;
    for (const provider of providers) {
      try {
        const { adapter, listId } = await this.adapterFor(ctx, order.storeId, provider);
        await adapter.upsertContact({ email, name: order.customer?.name ?? undefined, listId });
        await adapter.trackEvent({
          email,
          event,
          properties: { orderNumber: order.number, totalMinor: order.totalMinor, currency: order.currency },
        });
        tracked++;
      } catch {
        // best-effort
      }
    }
    return { tracked };
  }

  /** Re-sync every customer of a store to the enabled ESPs (merchant action). */
  async syncAll(ctx: TenantContext, storeId: string) {
    const providers = await this.enabledProviders(ctx, storeId);
    if (!providers.length) return { providers: 0, customers: 0 };
    const customers = await this.prisma.customer.findMany({
      where: { tenantId: ctx.tenantId, storeId, email: { not: null } },
    });
    for (const customer of customers) {
      for (const provider of providers) {
        try {
          const { adapter, listId } = await this.adapterFor(ctx, storeId, provider);
          await adapter.upsertContact({ email: customer.email!, name: customer.name ?? undefined, listId });
        } catch {
          // best-effort
        }
      }
    }
    return { providers: providers.length, customers: customers.length };
  }
}
