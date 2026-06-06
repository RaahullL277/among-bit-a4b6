import type { DiscountType, PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';

export interface BundleItemInput {
  variantId: string;
  quantity?: number;
}

export interface CreateBundleInput {
  storeId: string;
  title: string;
  description?: string;
  discountType?: DiscountType;
  discountValue?: number;
  active?: boolean;
  items: BundleItemInput[];
}

export interface UpdateBundleInput {
  title?: string;
  description?: string;
  discountType?: DiscountType;
  discountValue?: number;
  active?: boolean;
  items?: BundleItemInput[];
}

/** A line in a bundle, resolved to its current variant + price. */
interface PricedItem {
  variantId: string;
  quantity: number;
  productId: string;
  productTitle: string;
  variantTitle: string;
  unitPriceMinor: number;
}

interface PricedBundle {
  id: string;
  title: string;
  description: string | null;
  discountType: DiscountType;
  discountValue: number;
  active: boolean;
  items: PricedItem[];
  /** Sum of the items at list price. */
  subtotalMinor: number;
  /** Amount saved by the bundle. */
  discountMinor: number;
  /** What the shopper pays for the bundle (subtotal − discount). */
  totalMinor: number;
  currency: string;
}

/**
 * Conversion offers: curated **bundles** ("buy together & save") and an
 * automatic **frequently-bought-together** recommender derived from order
 * history. A bundle's saving is applied automatically at checkout when a cart
 * contains all of its items — no coupon codes. Both surface on the storefront
 * product page; merchants manage bundles from the admin.
 */
export class OfferService {
  constructor(private readonly prisma: PrismaClient) {}

  // --- Pricing helpers ------------------------------------------------------

  /** The saving a (type,value) discount yields on a subtotal, clamped to it. */
  private discountFor(subtotalMinor: number, type: DiscountType, value: number): number {
    if (subtotalMinor <= 0 || value <= 0) return 0;
    const raw = type === 'PERCENT' ? Math.round((subtotalMinor * value) / 100) : value;
    return Math.max(0, Math.min(raw, subtotalMinor));
  }

  private price(
    bundle: {
      id: string;
      title: string;
      description: string | null;
      discountType: DiscountType;
      discountValue: number;
      active: boolean;
      items: { quantity: number; variant: { id: string; title: string; priceMinor: number; currency: string; product: { id: string; title: string } } }[];
    },
  ): PricedBundle {
    const items: PricedItem[] = bundle.items.map((i) => ({
      variantId: i.variant.id,
      quantity: i.quantity,
      productId: i.variant.product.id,
      productTitle: i.variant.product.title,
      variantTitle: i.variant.title,
      unitPriceMinor: i.variant.priceMinor,
    }));
    const subtotalMinor = items.reduce((s, i) => s + i.unitPriceMinor * i.quantity, 0);
    const discountMinor = this.discountFor(subtotalMinor, bundle.discountType, bundle.discountValue);
    return {
      id: bundle.id,
      title: bundle.title,
      description: bundle.description,
      discountType: bundle.discountType,
      discountValue: bundle.discountValue,
      active: bundle.active,
      items,
      subtotalMinor,
      discountMinor,
      totalMinor: subtotalMinor - discountMinor,
      currency: bundle.items[0]?.variant.currency ?? 'INR',
    };
  }

  private readonly bundleInclude = {
    items: { include: { variant: { include: { product: { select: { id: true, title: true } } } } } },
  } as const;

  // --- Frequently bought together (auto) ------------------------------------

  /**
   * Products most often purchased in the same paid order as `productId`,
   * ranked by co-occurrence. Pure read over order history — no configuration.
   */
  async frequentlyBoughtTogether(storeId: string, productId: string, limit = 3) {
    // Orders that included this product (any variant of it), paid or fulfilled.
    const orders = await this.prisma.order.findMany({
      where: {
        storeId,
        status: { in: ['PAID', 'FULFILLED'] },
        items: { some: { variant: { productId } } },
      },
      select: { items: { select: { variant: { select: { productId: true } } } } },
      take: 500,
    });

    const counts = new Map<string, number>();
    for (const order of orders) {
      const others = new Set<string>();
      for (const item of order.items) {
        const pid = item.variant?.productId;
        if (pid && pid !== productId) others.add(pid);
      }
      for (const pid of others) counts.set(pid, (counts.get(pid) ?? 0) + 1);
    }

    const ranked = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([pid, count]) => ({ productId: pid, count }));
    if (!ranked.length) return [];

    // Hydrate the recommended products (active only) with their default variant.
    const products = await this.prisma.product.findMany({
      where: { id: { in: ranked.map((r) => r.productId) }, storeId, status: 'ACTIVE' },
      include: { variants: { take: 1, orderBy: { priceMinor: 'asc' } } },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    return ranked
      .map((r) => {
        const p = byId.get(r.productId);
        if (!p || !p.variants[0]) return null;
        const v = p.variants[0];
        return {
          productId: p.id,
          title: p.title,
          count: r.count,
          variantId: v.id,
          priceMinor: v.priceMinor,
          currency: v.currency,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }

  // --- Public (storefront) --------------------------------------------------

  /** Active bundles that include `productId`, priced for display. */
  async bundlesForProduct(storeId: string, productId: string) {
    const bundles = await this.prisma.bundle.findMany({
      where: { storeId, active: true, items: { some: { variant: { productId } } } },
      include: this.bundleInclude,
      orderBy: { createdAt: 'desc' },
    });
    return bundles.map((b) => this.price(b));
  }

  // --- Checkout integration -------------------------------------------------

  /**
   * Total bundle saving for a set of cart items. A bundle applies once when the
   * cart contains every one of its items at (at least) the required quantity.
   * Returns the aggregate discount and which bundles applied.
   */
  async computeCartDiscount(
    ctx: TenantContext,
    storeId: string,
    items: { variantId: string; quantity: number }[],
  ): Promise<{ discountMinor: number; applied: { bundleId: string; title: string; discountMinor: number }[] }> {
    const have = new Map<string, number>();
    for (const i of items) have.set(i.variantId, (have.get(i.variantId) ?? 0) + i.quantity);

    const bundles = await this.prisma.bundle.findMany({
      where: { tenantId: ctx.tenantId, storeId, active: true },
      include: this.bundleInclude,
    });

    const applied: { bundleId: string; title: string; discountMinor: number }[] = [];
    let discountMinor = 0;
    for (const bundle of bundles) {
      if (!bundle.items.length) continue;
      const satisfied = bundle.items.every((bi) => (have.get(bi.variantId) ?? 0) >= bi.quantity);
      if (!satisfied) continue;
      const priced = this.price(bundle);
      if (priced.discountMinor <= 0) continue;
      discountMinor += priced.discountMinor;
      applied.push({ bundleId: bundle.id, title: bundle.title, discountMinor: priced.discountMinor });
    }
    return { discountMinor, applied };
  }

  // --- Merchant management --------------------------------------------------

  async listBundles(ctx: TenantContext, storeId?: string) {
    const bundles = await this.prisma.bundle.findMany({
      where: { tenantId: ctx.tenantId, ...(storeId ? { storeId } : {}) },
      include: this.bundleInclude,
      orderBy: { createdAt: 'desc' },
    });
    return bundles.map((b) => this.price(b));
  }

  async getBundle(ctx: TenantContext, id: string) {
    const bundle = await this.prisma.bundle.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: this.bundleInclude,
    });
    if (!bundle) throw new NotFoundError('Bundle', id);
    return this.price(bundle);
  }

  async createBundle(ctx: TenantContext, input: CreateBundleInput) {
    if (!input.title?.trim()) throw new ValidationError('A bundle title is required.');
    const items = await this.resolveItems(ctx, input.storeId, input.items);
    const discountValue = this.validateDiscount(input.discountType ?? 'PERCENT', input.discountValue ?? 0);

    const store = await this.prisma.store.findFirst({
      where: { id: input.storeId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!store) throw new NotFoundError('Store', input.storeId);

    const bundle = await this.prisma.bundle.create({
      data: {
        tenantId: ctx.tenantId,
        storeId: input.storeId,
        title: input.title.trim(),
        description: input.description,
        discountType: input.discountType ?? 'PERCENT',
        discountValue,
        active: input.active ?? true,
        items: {
          create: items.map((i) => ({ tenantId: ctx.tenantId, variantId: i.variantId, quantity: i.quantity })),
        },
      },
      include: this.bundleInclude,
    });
    return this.price(bundle);
  }

  async updateBundle(ctx: TenantContext, id: string, patch: UpdateBundleInput) {
    const existing = await this.prisma.bundle.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, storeId: true, discountType: true },
    });
    if (!existing) throw new NotFoundError('Bundle', id);

    const data: Record<string, unknown> = {};
    if (patch.title !== undefined) {
      if (!patch.title.trim()) throw new ValidationError('A bundle title is required.');
      data.title = patch.title.trim();
    }
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.active !== undefined) data.active = patch.active;
    if (patch.discountType !== undefined) data.discountType = patch.discountType;
    if (patch.discountValue !== undefined) {
      data.discountValue = this.validateDiscount(patch.discountType ?? existing.discountType, patch.discountValue);
    }

    await this.prisma.$transaction(async (tx) => {
      if (patch.items) {
        const items = await this.resolveItems(ctx, existing.storeId, patch.items);
        await tx.bundleItem.deleteMany({ where: { bundleId: id } });
        await tx.bundleItem.createMany({
          data: items.map((i) => ({ tenantId: ctx.tenantId, bundleId: id, variantId: i.variantId, quantity: i.quantity })),
        });
      }
      await tx.bundle.update({ where: { id }, data });
    });
    return this.getBundle(ctx, id);
  }

  async deleteBundle(ctx: TenantContext, id: string) {
    const existing = await this.prisma.bundle.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true } });
    if (!existing) throw new NotFoundError('Bundle', id);
    await this.prisma.bundle.delete({ where: { id } });
    return { id, deleted: true };
  }

  // --- Internals ------------------------------------------------------------

  private validateDiscount(type: DiscountType, value: number): number {
    const v = Math.round(Number(value));
    if (!Number.isFinite(v) || v < 0) throw new ValidationError('Discount value must be a non-negative number.');
    if (type === 'PERCENT' && v > 100) throw new ValidationError('A percent discount cannot exceed 100.');
    return v;
  }

  /** Validate bundle items belong to the store (tenant-scoped) and dedupe. */
  private async resolveItems(ctx: TenantContext, storeId: string, items: BundleItemInput[]) {
    if (!items?.length || items.length < 2) {
      throw new ValidationError('A bundle needs at least two items.');
    }
    const normalized = new Map<string, number>();
    for (const item of items) {
      const qty = Math.round(Number(item.quantity ?? 1));
      if (!item.variantId) throw new ValidationError('Each bundle item needs a variantId.');
      if (qty <= 0) throw new ValidationError('Bundle item quantity must be positive.');
      normalized.set(item.variantId, (normalized.get(item.variantId) ?? 0) + qty);
    }
    const variantIds = [...normalized.keys()];
    const found = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds }, tenantId: ctx.tenantId, product: { storeId } },
      select: { id: true },
    });
    if (found.length !== variantIds.length) {
      throw new ValidationError('One or more bundle items are not variants of this store.');
    }
    return variantIds.map((variantId) => ({ variantId, quantity: normalized.get(variantId)! }));
  }
}
