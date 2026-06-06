import type { ImportSource, Prisma, PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';
import type { ProductService } from './product.service.js';
import type { CustomerService } from './customer.service.js';
import {
  type ImportKind,
  type ImportSourceName,
  parseImportCustomers,
  parseProducts,
} from '../migration/parsers.js';

export interface RunImportInput {
  storeId: string;
  source: ImportSource;
  /** What the export contains; defaults to "products". */
  kind?: ImportKind;
  /** Raw export contents (CSV text, or JSON in the platform's own shape). */
  data: string;
  /** Preview only — parse + report without creating anything. */
  dryRun?: boolean;
}

interface ReportRow {
  kind: 'product' | 'customer';
  name: string;
  status: 'created' | 'skipped' | 'failed';
  reason?: string;
}

/**
 * Store bootstrap / migration agent: parse a products or customers export from
 * Shopify, WooCommerce, Dukaan (or a generic CSV/JSON) and create the records on
 * a store via the existing services. Idempotent + resumable — products already
 * present (by title or SKU) and customers (by email) are skipped — and every run
 * records a per-row report. `dryRun` previews without writing.
 */
export class StoreImportService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly products: ProductService,
    private readonly customers: CustomerService,
  ) {}

  private async assertStore(ctx: TenantContext, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, tenantId: ctx.tenantId }, select: { id: true } });
    if (!store) throw new NotFoundError('Store', storeId);
  }

  async run(ctx: TenantContext, input: RunImportInput) {
    await this.assertStore(ctx, input.storeId);
    if (!input.data?.trim()) throw new ValidationError('Import data (the export contents) is required.');
    const kind: ImportKind = input.kind ?? 'products';
    const dryRun = Boolean(input.dryRun);

    const job = await this.prisma.importJob.create({
      data: { tenantId: ctx.tenantId, storeId: input.storeId, source: input.source, status: 'RUNNING', dryRun },
    });

    try {
      const result =
        kind === 'customers'
          ? await this.importCustomers(ctx, input, dryRun)
          : await this.importProducts(ctx, input, dryRun);

      return this.prisma.importJob.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          productsCreated: result.productsCreated,
          productsSkipped: result.productsSkipped,
          customersCreated: result.customersCreated,
          customersSkipped: result.customersSkipped,
          failed: result.failed,
          report: result.report as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      return this.prisma.importJob.update({
        where: { id: job.id },
        data: { status: 'FAILED', error: (err as Error).message },
      });
    }
  }

  private async importProducts(ctx: TenantContext, input: RunImportInput, dryRun: boolean) {
    const parsed = parseProducts(input.source as ImportSourceName, input.data);
    if (!parsed.length) throw new ValidationError('No products found in the export. Check the source/format.');

    // Existing titles + SKUs for idempotency (skip what's already there).
    const existing = await this.prisma.product.findMany({
      where: { storeId: input.storeId },
      select: { title: true, variants: { select: { sku: true } } },
    });
    const titles = new Set(existing.map((p) => p.title.trim().toLowerCase()));
    const skus = new Set(existing.flatMap((p) => p.variants.map((v) => v.sku).filter((s): s is string => Boolean(s)).map((s) => s.toLowerCase())));

    const report: ReportRow[] = [];
    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const p of parsed) {
      const titleKey = p.title.trim().toLowerCase();
      const dupSku = p.variants.find((v) => v.sku && skus.has(v.sku.toLowerCase()));
      if (titles.has(titleKey) || dupSku) {
        skipped++;
        report.push({ kind: 'product', name: p.title, status: 'skipped', reason: dupSku ? `SKU "${dupSku.sku}" already exists` : 'title already exists' });
        continue;
      }
      if (dryRun) {
        created++;
        report.push({ kind: 'product', name: p.title, status: 'created', reason: 'preview' });
        titles.add(titleKey);
        for (const v of p.variants) if (v.sku) skus.add(v.sku.toLowerCase());
        continue;
      }
      try {
        await this.products.create(ctx, {
          storeId: input.storeId,
          title: p.title,
          description: p.description,
          status: p.status,
          variants: p.variants.map((v) => ({
            title: v.title,
            sku: v.sku,
            priceMinor: Math.max(0, v.priceMinor),
            compareAtMinor: v.compareAtMinor && v.compareAtMinor >= v.priceMinor ? v.compareAtMinor : undefined,
            inventory: v.inventory ?? 0,
          })),
        });
        created++;
        report.push({ kind: 'product', name: p.title, status: 'created' });
        titles.add(titleKey);
        for (const v of p.variants) if (v.sku) skus.add(v.sku.toLowerCase());
      } catch (err) {
        failed++;
        report.push({ kind: 'product', name: p.title, status: 'failed', reason: (err as Error).message });
      }
    }

    return { productsCreated: created, productsSkipped: skipped, customersCreated: 0, customersSkipped: 0, failed, report };
  }

  private async importCustomers(ctx: TenantContext, input: RunImportInput, dryRun: boolean) {
    const parsed = parseImportCustomers(input.source as ImportSourceName, input.data);
    if (!parsed.length) throw new ValidationError('No customers found in the export. Check the source/format.');

    const existing = await this.prisma.customer.findMany({
      where: { storeId: input.storeId, email: { not: null } },
      select: { email: true },
    });
    const emails = new Set(existing.map((c) => c.email!.toLowerCase()));

    const report: ReportRow[] = [];
    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const c of parsed) {
      const label = c.name || c.email || c.phone || 'customer';
      if (c.email && emails.has(c.email.toLowerCase())) {
        skipped++;
        report.push({ kind: 'customer', name: label, status: 'skipped', reason: 'email already exists' });
        continue;
      }
      if (dryRun) {
        created++;
        report.push({ kind: 'customer', name: label, status: 'created', reason: 'preview' });
        if (c.email) emails.add(c.email.toLowerCase());
        continue;
      }
      try {
        await this.customers.create(ctx, { storeId: input.storeId, name: c.name, email: c.email, phone: c.phone });
        created++;
        report.push({ kind: 'customer', name: label, status: 'created' });
        if (c.email) emails.add(c.email.toLowerCase());
      } catch (err) {
        failed++;
        report.push({ kind: 'customer', name: label, status: 'failed', reason: (err as Error).message });
      }
    }

    return { productsCreated: 0, productsSkipped: 0, customersCreated: created, customersSkipped: skipped, failed, report };
  }

  // --- Read -----------------------------------------------------------------

  async list(ctx: TenantContext, storeId?: string) {
    return this.prisma.importJob.findMany({
      where: { tenantId: ctx.tenantId, ...(storeId ? { storeId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async get(ctx: TenantContext, id: string) {
    const job = await this.prisma.importJob.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!job) throw new NotFoundError('ImportJob', id);
    return job;
  }
}
