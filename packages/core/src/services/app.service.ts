import type { PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';

export interface PublishAppInput {
  slug: string;
  name: string;
  description?: string;
  developer?: string;
  category?: string;
  scopes?: string[];
  webhookUrl?: string;
  published?: boolean;
}

// A small starter catalog so the marketplace isn't empty out of the box.
const SEED_APPS: PublishAppInput[] = [
  { slug: 'whatsapp-broadcast', name: 'WhatsApp Broadcast', developer: 'ACP Labs', category: 'Marketing', description: 'Send WhatsApp broadcasts to opted-in customer segments.', scopes: ['customers:read', 'notifications:write'] },
  { slug: 'google-merchant-feed', name: 'Google Merchant Feed', developer: 'ACP Labs', category: 'Channels', description: 'Sync your catalog to Google Shopping.', scopes: ['products:read'] },
  { slug: 'review-importer', name: 'Review Importer', developer: 'Trustlane', category: 'Reviews', description: 'Import historical reviews from other platforms.', scopes: ['products:read', 'customers:read'] },
  { slug: 'restock-forecaster', name: 'Restock Forecaster', developer: 'StockIQ', category: 'Operations', description: 'Demand forecasting and purchase-order suggestions.', scopes: ['products:read', 'orders:read'] },
];

/**
 * Partner-app marketplace runtime. Operators curate a catalog of apps; merchants
 * install/uninstall them, granting the app's requested scopes (the install
 * lifecycle + permission grant). Apps declare a webhookUrl to receive events
 * (delivery itself is a stub, like the other provider adapters).
 */
export class AppService {
  constructor(private readonly prisma: PrismaClient) {}

  // --- Catalog (operator-curated) -------------------------------------------

  /** Idempotently publish/update a catalog app (operator action). */
  async publish(input: PublishAppInput) {
    if (!input.slug || !input.name) throw new ValidationError('slug and name are required.');
    const data = {
      name: input.name,
      description: input.description ?? null,
      developer: input.developer ?? null,
      category: input.category ?? null,
      scopes: input.scopes ?? [],
      webhookUrl: input.webhookUrl ?? null,
      published: input.published ?? true,
    };
    return this.prisma.app.upsert({ where: { slug: input.slug }, create: { slug: input.slug, ...data }, update: data });
  }

  /** Seed the starter catalog (no-op for apps that already exist). */
  async seedCatalog() {
    let created = 0;
    for (const app of SEED_APPS) {
      const existing = await this.prisma.app.findUnique({ where: { slug: app.slug }, select: { id: true } });
      if (!existing) { await this.publish(app); created++; }
    }
    return { created, total: SEED_APPS.length };
  }

  /** The published catalog a merchant can browse. */
  async catalog() {
    return this.prisma.app.findMany({ where: { published: true }, orderBy: { name: 'asc' } });
  }

  // --- Installs (merchant-facing, tenant-scoped) ----------------------------

  async listInstalled(ctx: TenantContext) {
    const rows = await this.prisma.appInstallation.findMany({
      where: { tenantId: ctx.tenantId },
      include: { app: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      enabled: r.enabled,
      scopes: r.scopes,
      installedAt: r.createdAt,
      app: { id: r.app.id, slug: r.app.slug, name: r.app.name, developer: r.app.developer, category: r.app.category, description: r.app.description },
    }));
  }

  /** Install an app, granting its requested scopes. Idempotent. */
  async install(ctx: TenantContext, appId: string, config?: Record<string, unknown>) {
    const app = await this.prisma.app.findFirst({ where: { OR: [{ id: appId }, { slug: appId }], published: true } });
    if (!app) throw new NotFoundError('App', appId);
    return this.prisma.appInstallation.upsert({
      where: { tenantId_appId: { tenantId: ctx.tenantId, appId: app.id } },
      create: { tenantId: ctx.tenantId, appId: app.id, scopes: app.scopes, enabled: true, config: (config ?? undefined) as object | undefined },
      update: { enabled: true, scopes: app.scopes, ...(config ? { config: config as object } : {}) },
    });
  }

  async setEnabled(ctx: TenantContext, appId: string, enabled: boolean) {
    const app = await this.resolveInstalledApp(ctx, appId);
    return this.prisma.appInstallation.update({ where: { tenantId_appId: { tenantId: ctx.tenantId, appId: app.id } }, data: { enabled } });
  }

  async uninstall(ctx: TenantContext, appId: string) {
    const app = await this.resolveInstalledApp(ctx, appId);
    await this.prisma.appInstallation.delete({ where: { tenantId_appId: { tenantId: ctx.tenantId, appId: app.id } } });
    return { uninstalled: true };
  }

  /**
   * Webhook subscribers for an event scope — the set of enabled installs whose
   * app requested a matching scope. Other services call this to fan out events;
   * the actual HTTP POST is a stub for now (no live network).
   */
  async subscribersFor(tenantId: string, scope: string): Promise<{ appId: string; webhookUrl: string | null }[]> {
    const rows = await this.prisma.appInstallation.findMany({
      where: { tenantId, enabled: true, app: { scopes: { has: scope } } },
      include: { app: { select: { id: true, webhookUrl: true } } },
    });
    return rows.map((r) => ({ appId: r.app.id, webhookUrl: r.app.webhookUrl }));
  }

  private async resolveInstalledApp(ctx: TenantContext, appId: string) {
    const app = await this.prisma.app.findFirst({ where: { OR: [{ id: appId }, { slug: appId }] }, select: { id: true } });
    if (!app) throw new NotFoundError('App', appId);
    const install = await this.prisma.appInstallation.findUnique({ where: { tenantId_appId: { tenantId: ctx.tenantId, appId: app.id } }, select: { id: true } });
    if (!install) throw new NotFoundError('AppInstallation', appId);
    return app;
  }
}
