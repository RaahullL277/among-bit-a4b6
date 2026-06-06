import type { ImportSource, Prisma, PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';
import type { ProductService } from './product.service.js';
import type { CustomerService } from './customer.service.js';
import type { StockService } from './stock.service.js';
import {
  type ImportCustomer,
  type ImportInventoryRow,
  type ImportKind,
  type ImportOrder,
  type ImportProduct,
  type ImportSourceName,
  parseImportCustomers,
  parseInventory,
  parseOrders,
  parseProducts,
} from '../migration/parsers.js';
import { type ApiCredentials, type FetchImpl, fetchFromApi } from '../migration/fetchers.js';

export interface RunImportInput {
  storeId: string;
  source: ImportSource;
  /** What the export contains; defaults to "products". */
  kind?: ImportKind;
  /** Raw export contents (CSV text, or JSON in the platform's own shape). */
  data: string;
  /** Preview only — parse + report without creating anything. */
  dryRun?: boolean;
  /** For products: update existing items (by SKU) instead of skipping them. */
  updateExisting?: boolean;
}

export interface RunApiImportInput {
  storeId: string;
  source: ImportSource;
  kind?: ImportKind;
  /** Live store API credentials (Shopify: {shop, accessToken}; Woo: {url, consumerKey, consumerSecret}). */
  credentials: ApiCredentials;
  dryRun?: boolean;
  updateExisting?: boolean;
}

interface ReportRow {
  kind: 'product' | 'customer' | 'order' | 'inventory';
  name: string;
  status: 'created' | 'updated' | 'skipped' | 'failed';
  reason?: string;
}

interface Counts {
  productsCreated: number;
  productsSkipped: number;
  customersCreated: number;
  customersSkipped: number;
  failed: number;
  report: ReportRow[];
}

interface ParsedPayload {
  products?: ImportProduct[];
  customers?: ImportCustomer[];
  orders?: ImportOrder[];
  inventory?: ImportInventoryRow[];
}

/**
 * Store bootstrap / migration agent. Imports products, customers, historical
 * orders, or an inventory sheet from Shopify, WooCommerce, Dukaan (or a generic
 * CSV/JSON) — either by pasting an export (`run`) or by pulling live from the
 * source store's API (`runFromApi`). Idempotent + resumable (skip by
 * title/SKU/email/order-ref), with a `dryRun` preview and a per-row report.
 */
export class StoreImportService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly products: ProductService,
    private readonly customers: CustomerService,
    private readonly stock?: StockService,
  ) {}

  private async assertStore(ctx: TenantContext, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, tenantId: ctx.tenantId }, select: { id: true } });
    if (!store) throw new NotFoundError('Store', storeId);
  }

  // --- Entry points ---------------------------------------------------------

  /** Import from a pasted export (CSV text or JSON). */
  async run(ctx: TenantContext, input: RunImportInput) {
    await this.assertStore(ctx, input.storeId);
    if (!input.data?.trim()) throw new ValidationError('Import data (the export contents) is required.');
    const kind: ImportKind = input.kind ?? 'products';
    const source = input.source as ImportSourceName;
    const parsed: ParsedPayload =
      kind === 'customers'
        ? { customers: parseImportCustomers(source, input.data) }
        : kind === 'orders'
          ? { orders: parseOrders(source, input.data) }
          : kind === 'inventory'
            ? { inventory: parseInventory(input.data) }
            : { products: parseProducts(source, input.data) };
    return this.execute(ctx, { storeId: input.storeId, source: input.source, kind, dryRun: Boolean(input.dryRun), updateExisting: Boolean(input.updateExisting) }, parsed);
  }

  /** Pull live from the source store's API (Shopify Admin API / WooCommerce REST). */
  async runFromApi(ctx: TenantContext, input: RunApiImportInput, fetchImpl?: FetchImpl) {
    await this.assertStore(ctx, input.storeId);
    const kind: ImportKind = input.kind ?? 'products';
    if (input.source !== 'SHOPIFY' && input.source !== 'WOOCOMMERCE') {
      throw new ValidationError('Live API import supports only SHOPIFY and WOOCOMMERCE.');
    }
    const fetched = await fetchFromApi(input.source, input.credentials, kind, fetchImpl);
    return this.execute(ctx, { storeId: input.storeId, source: input.source, kind, dryRun: Boolean(input.dryRun), updateExisting: Boolean(input.updateExisting) }, fetched);
  }

  // --- Job wrapper ----------------------------------------------------------

  private async execute(
    ctx: TenantContext,
    meta: { storeId: string; source: ImportSource; kind: ImportKind; dryRun: boolean; updateExisting: boolean },
    parsed: ParsedPayload,
  ) {
    const job = await this.prisma.importJob.create({
      data: { tenantId: ctx.tenantId, storeId: meta.storeId, source: meta.source, status: 'RUNNING', dryRun: meta.dryRun },
    });
    try {
      let result: Counts;
      if (meta.kind === 'customers') result = await this.createCustomers(ctx, meta.storeId, parsed.customers ?? [], meta.dryRun);
      else if (meta.kind === 'orders') result = await this.createOrders(ctx, meta.storeId, parsed.orders ?? [], meta.dryRun);
      else if (meta.kind === 'inventory') result = await this.applyInventory(ctx, meta.storeId, parsed.inventory ?? [], meta.dryRun);
      else result = await this.createProducts(ctx, meta.storeId, parsed.products ?? [], meta.dryRun, meta.updateExisting);

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
      return this.prisma.importJob.update({ where: { id: job.id }, data: { status: 'FAILED', error: (err as Error).message } });
    }
  }

  // --- Products -------------------------------------------------------------

  private async createProducts(ctx: TenantContext, storeId: string, parsed: ImportProduct[], dryRun: boolean, updateExisting: boolean): Promise<Counts> {
    if (!parsed.length) throw new ValidationError('No products found in the export. Check the source/format.');
    const existing = await this.prisma.product.findMany({
      where: { storeId },
      select: { title: true, variants: { select: { id: true, sku: true } } },
    });
    const titles = new Set(existing.map((p) => p.title.trim().toLowerCase()));
    const skuToVariant = new Map<string, string>();
    for (const p of existing) for (const v of p.variants) if (v.sku) skuToVariant.set(v.sku.toLowerCase(), v.id);

    const report: ReportRow[] = [];
    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const p of parsed) {
      const titleKey = p.title.trim().toLowerCase();
      const dupSku = p.variants.find((v) => v.sku && skuToVariant.has(v.sku.toLowerCase()));
      const isDup = titles.has(titleKey) || Boolean(dupSku);

      if (isDup && updateExisting) {
        // Refresh price + inventory on the matched variants (by SKU).
        let touched = 0;
        for (const v of p.variants) {
          const vid = v.sku ? skuToVariant.get(v.sku.toLowerCase()) : undefined;
          if (!vid) continue;
          if (!dryRun) {
            await this.products.updateVariant(ctx, vid, { priceMinor: Math.max(0, v.priceMinor) }).catch(() => undefined);
            if (v.inventory != null && this.stock) await this.stock.setInventory(ctx, { variantId: vid, quantity: Math.max(0, v.inventory), note: 'Import update' }).catch(() => undefined);
          }
          touched++;
        }
        created += touched > 0 ? 1 : 0;
        report.push({ kind: 'product', name: p.title, status: 'updated', reason: touched ? `${touched} variant(s)` : 'no SKU match' });
        continue;
      }
      if (isDup) {
        skipped++;
        report.push({ kind: 'product', name: p.title, status: 'skipped', reason: dupSku ? `SKU "${dupSku.sku}" already exists` : 'title already exists' });
        continue;
      }
      if (dryRun) {
        created++;
        report.push({ kind: 'product', name: p.title, status: 'created', reason: 'preview' });
        titles.add(titleKey);
        for (const v of p.variants) if (v.sku) skuToVariant.set(v.sku.toLowerCase(), 'preview');
        continue;
      }
      try {
        await this.products.create(ctx, {
          storeId,
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
        for (const v of p.variants) if (v.sku) skuToVariant.set(v.sku.toLowerCase(), 'new');
      } catch (err) {
        failed++;
        report.push({ kind: 'product', name: p.title, status: 'failed', reason: (err as Error).message });
      }
    }
    return { productsCreated: created, productsSkipped: skipped, customersCreated: 0, customersSkipped: 0, failed, report };
  }

  // --- Customers ------------------------------------------------------------

  private async createCustomers(ctx: TenantContext, storeId: string, parsed: ImportCustomer[], dryRun: boolean): Promise<Counts> {
    if (!parsed.length) throw new ValidationError('No customers found in the export. Check the source/format.');
    const existing = await this.prisma.customer.findMany({ where: { storeId, email: { not: null } }, select: { email: true } });
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
        await this.customers.create(ctx, { storeId, name: c.name, email: c.email, phone: c.phone });
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

  // --- Historical orders ----------------------------------------------------

  private async createOrders(ctx: TenantContext, storeId: string, parsed: ImportOrder[], dryRun: boolean): Promise<Counts> {
    if (!parsed.length) throw new ValidationError('No orders found in the export. Check the source/format.');
    const existing = await this.prisma.order.findMany({ where: { storeId, sourceRef: { not: null } }, select: { sourceRef: true } });
    const seen = new Set(existing.map((o) => o.sourceRef!));
    // Link line items to variants by SKU, and orders to customers by email.
    const variants = await this.prisma.productVariant.findMany({ where: { product: { storeId }, sku: { not: null } }, select: { id: true, sku: true } });
    const skuToVariant = new Map(variants.map((v) => [v.sku!.toLowerCase(), v.id]));
    const customers = await this.prisma.customer.findMany({ where: { storeId, email: { not: null } }, select: { id: true, email: true } });
    const emailToCustomer = new Map(customers.map((c) => [c.email!.toLowerCase(), c.id]));

    const last = await this.prisma.order.aggregate({ where: { storeId }, _max: { number: true } });
    let nextNumber = (last._max.number ?? 0) + 1;

    const report: ReportRow[] = [];
    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const o of parsed) {
      if (seen.has(o.sourceRef)) {
        skipped++;
        report.push({ kind: 'order', name: o.sourceRef, status: 'skipped', reason: 'already imported' });
        continue;
      }
      if (dryRun) {
        created++;
        report.push({ kind: 'order', name: o.sourceRef, status: 'created', reason: 'preview' });
        seen.add(o.sourceRef);
        continue;
      }
      try {
        const subtotal = o.items.reduce((s, i) => s + i.unitPriceMinor * i.quantity, 0);
        const when = o.createdAt ? new Date(o.createdAt) : undefined;
        const createdAt = when && !Number.isNaN(when.getTime()) ? when : undefined;
        await this.prisma.order.create({
          data: {
            tenantId: ctx.tenantId,
            storeId,
            number: nextNumber++,
            status: o.status,
            subtotalMinor: subtotal,
            totalMinor: o.totalMinor || subtotal,
            currency: o.currency || 'INR',
            email: o.email,
            customerId: o.email ? emailToCustomer.get(o.email.toLowerCase()) : undefined,
            source: 'import',
            sourceRef: o.sourceRef,
            ...(createdAt ? { createdAt } : {}),
            items: {
              create: o.items.map((i) => ({
                tenantId: ctx.tenantId,
                variantId: i.sku ? skuToVariant.get(i.sku.toLowerCase()) ?? null : null,
                title: i.title,
                quantity: i.quantity,
                unitPriceMinor: i.unitPriceMinor,
              })),
            },
          },
        });
        created++;
        report.push({ kind: 'order', name: o.sourceRef, status: 'created' });
        seen.add(o.sourceRef);
      } catch (err) {
        failed++;
        report.push({ kind: 'order', name: o.sourceRef, status: 'failed', reason: (err as Error).message });
      }
    }
    return { productsCreated: created, productsSkipped: skipped, customersCreated: 0, customersSkipped: 0, failed, report };
  }

  // --- Inventory sheet ------------------------------------------------------

  private async applyInventory(ctx: TenantContext, storeId: string, rows: ImportInventoryRow[], dryRun: boolean): Promise<Counts> {
    if (!rows.length) throw new ValidationError('No inventory rows found (need SKU + quantity columns).');
    const variants = await this.prisma.productVariant.findMany({ where: { product: { storeId }, sku: { not: null } }, select: { id: true, sku: true } });
    const skuToVariant = new Map(variants.map((v) => [v.sku!.toLowerCase(), v.id]));

    const report: ReportRow[] = [];
    let updated = 0;
    let notFound = 0;
    let failed = 0;

    for (const r of rows) {
      const vid = skuToVariant.get(r.sku.toLowerCase());
      if (!vid) {
        notFound++;
        report.push({ kind: 'inventory', name: r.sku, status: 'skipped', reason: 'no matching SKU' });
        continue;
      }
      if (dryRun) {
        updated++;
        report.push({ kind: 'inventory', name: r.sku, status: 'updated', reason: 'preview' });
        continue;
      }
      try {
        if (this.stock) await this.stock.setInventory(ctx, { variantId: vid, quantity: Math.max(0, Math.round(r.quantity)), note: 'Imported stock sheet' });
        updated++;
        report.push({ kind: 'inventory', name: r.sku, status: 'updated' });
      } catch (err) {
        failed++;
        report.push({ kind: 'inventory', name: r.sku, status: 'failed', reason: (err as Error).message });
      }
    }
    return { productsCreated: updated, productsSkipped: notFound, customersCreated: 0, customersSkipped: 0, failed, report };
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
