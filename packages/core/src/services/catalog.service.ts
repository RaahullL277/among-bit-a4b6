import type { Prisma, PrismaClient, ProductAssetType } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';

export interface OptionInput { name: string; values: string[] }
export interface AttributeInput { name: string; value: string; unit?: string | null; filterable?: boolean }
export interface PriceTierInput { minQuantity: number; priceMinor: number }
export interface FilterInput {
  q?: string;
  brand?: string;
  productType?: string;
  collection?: string; // handle
  minPriceMinor?: number;
  maxPriceMinor?: number;
  /** Attribute filters as "Name:Value" pairs (filterable attributes only). */
  attributes?: string[];
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'title';
  limit?: number;
}

function slugify(v: string): string {
  return v.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

/**
 * Structured merchandising: variant options, spec attributes, categories
 * (collections + membership), document assets, and B2B price tiers — plus the
 * faceted storefront filter. Backs the multi-vertical catalog (fashion,
 * jewellery, cosmetics, electronics, robotics, wellness).
 */
export class CatalogService {
  constructor(private readonly prisma: PrismaClient) {}

  private async assertProduct(ctx: TenantContext, productId: string) {
    const p = await this.prisma.product.findFirst({ where: { id: productId, tenantId: ctx.tenantId }, select: { id: true, storeId: true } });
    if (!p) throw new NotFoundError('Product', productId);
    return p;
  }
  private async assertVariant(ctx: TenantContext, variantId: string) {
    const v = await this.prisma.productVariant.findFirst({ where: { id: variantId, tenantId: ctx.tenantId }, select: { id: true } });
    if (!v) throw new NotFoundError('ProductVariant', variantId);
    return v;
  }
  private async assertStore(ctx: TenantContext, storeId: string) {
    const s = await this.prisma.store.findFirst({ where: { id: storeId, tenantId: ctx.tenantId }, select: { id: true } });
    if (!s) throw new NotFoundError('Store', storeId);
  }

  // --- Variant options (P0-2) -----------------------------------------------

  /** Replace a product's option definitions (e.g. Size: [S,M,L], Colour: [Red,Blue]). */
  async setOptions(ctx: TenantContext, productId: string, options: OptionInput[]) {
    await this.assertProduct(ctx, productId);
    const clean = (options ?? []).filter((o) => o?.name?.trim() && Array.isArray(o.values));
    await this.prisma.$transaction(async (tx) => {
      await tx.productOption.deleteMany({ where: { productId } });
      for (let i = 0; i < clean.length; i++) {
        const o = clean[i];
        await tx.productOption.create({
          data: {
            tenantId: ctx.tenantId,
            productId,
            name: o.name.trim(),
            position: i,
            values: {
              create: [...new Set(o.values.map((v) => v.trim()).filter(Boolean))].map((value, j) => ({ tenantId: ctx.tenantId, value, position: j })),
            },
          },
        });
      }
    });
    return this.getOptions(ctx, productId);
  }

  async getOptions(ctx: TenantContext, productId: string) {
    await this.assertProduct(ctx, productId);
    return this.prisma.productOption.findMany({
      where: { productId },
      orderBy: { position: 'asc' },
      include: { values: { orderBy: { position: 'asc' } } },
    });
  }

  // --- Attributes / specifications (P1-2) -----------------------------------

  /** Replace a product's spec attributes. */
  async setAttributes(ctx: TenantContext, productId: string, attrs: AttributeInput[]) {
    await this.assertProduct(ctx, productId);
    const clean = (attrs ?? []).filter((a) => a?.name?.trim() && a?.value?.trim());
    await this.prisma.$transaction(async (tx) => {
      await tx.productAttribute.deleteMany({ where: { productId } });
      if (clean.length) {
        await tx.productAttribute.createMany({
          data: clean.map((a, i) => ({ tenantId: ctx.tenantId, productId, name: a.name.trim(), value: a.value.trim(), unit: a.unit ?? undefined, position: i, filterable: Boolean(a.filterable) })),
        });
      }
    });
    return this.prisma.productAttribute.findMany({ where: { productId }, orderBy: { position: 'asc' } });
  }

  async getAttributes(ctx: TenantContext, productId: string) {
    await this.assertProduct(ctx, productId);
    return this.prisma.productAttribute.findMany({ where: { productId }, orderBy: { position: 'asc' } });
  }

  // --- Collections / categories (P1-1) --------------------------------------

  async createCollection(ctx: TenantContext, input: { storeId: string; title: string; handle?: string; description?: string; imageUrl?: string; position?: number }) {
    await this.assertStore(ctx, input.storeId);
    if (!input.title?.trim()) throw new ValidationError('A collection title is required.');
    const handle = slugify(input.handle ?? input.title);
    if (!handle) throw new ValidationError('A valid handle is required.');
    const clash = await this.prisma.collection.findUnique({ where: { storeId_handle: { storeId: input.storeId, handle } } });
    if (clash) throw new ValidationError(`A collection with handle "${handle}" already exists.`);
    return this.prisma.collection.create({
      data: { tenantId: ctx.tenantId, storeId: input.storeId, title: input.title.trim(), handle, description: input.description, imageUrl: input.imageUrl, position: input.position ?? 0 },
    });
  }

  async listCollections(ctx: TenantContext, storeId: string) {
    await this.assertStore(ctx, storeId);
    const rows = await this.prisma.collection.findMany({
      where: { tenantId: ctx.tenantId, storeId },
      orderBy: [{ position: 'asc' }, { title: 'asc' }],
      include: { _count: { select: { products: true } } },
    });
    return rows.map((c) => ({ id: c.id, title: c.title, handle: c.handle, description: c.description, imageUrl: c.imageUrl, position: c.position, productCount: c._count.products }));
  }

  async updateCollection(ctx: TenantContext, id: string, patch: { title?: string; description?: string; imageUrl?: string; position?: number }) {
    const c = await this.prisma.collection.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!c) throw new NotFoundError('Collection', id);
    return this.prisma.collection.update({ where: { id }, data: { title: patch.title?.trim() || undefined, description: patch.description, imageUrl: patch.imageUrl, position: patch.position } });
  }

  async removeCollection(ctx: TenantContext, id: string) {
    const c = await this.prisma.collection.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!c) throw new NotFoundError('Collection', id);
    await this.prisma.collection.delete({ where: { id } });
    return { id, deleted: true };
  }

  /** Replace the collections a product belongs to. */
  async setProductCollections(ctx: TenantContext, productId: string, collectionIds: string[]) {
    await this.assertProduct(ctx, productId);
    const valid = await this.prisma.collection.findMany({ where: { id: { in: collectionIds ?? [] }, tenantId: ctx.tenantId }, select: { id: true } });
    const ids = valid.map((v) => v.id);
    await this.prisma.$transaction(async (tx) => {
      await tx.productCollection.deleteMany({ where: { productId } });
      if (ids.length) await tx.productCollection.createMany({ data: ids.map((collectionId, i) => ({ tenantId: ctx.tenantId, productId, collectionId, position: i })) });
    });
    return { productId, collectionIds: ids };
  }

  // --- Document assets (P2-1) -----------------------------------------------

  async addAsset(ctx: TenantContext, input: { productId: string; type: ProductAssetType; url: string; title?: string }) {
    const p = await this.assertProduct(ctx, input.productId);
    if (!input.url?.trim()) throw new ValidationError('An asset URL is required.');
    const agg = await this.prisma.productAsset.aggregate({ where: { productId: input.productId }, _max: { position: true } });
    return this.prisma.productAsset.create({
      data: { tenantId: ctx.tenantId, storeId: p.storeId, productId: input.productId, type: input.type ?? 'OTHER', url: input.url.trim(), title: input.title, position: (agg._max.position ?? -1) + 1 },
    });
  }

  async listAssets(ctx: TenantContext, productId: string) {
    await this.assertProduct(ctx, productId);
    return this.prisma.productAsset.findMany({ where: { productId }, orderBy: { position: 'asc' } });
  }

  async removeAsset(ctx: TenantContext, id: string) {
    const a = await this.prisma.productAsset.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!a) throw new NotFoundError('ProductAsset', id);
    await this.prisma.productAsset.delete({ where: { id } });
    return { id, deleted: true };
  }

  // --- B2B price tiers (P2-3) -----------------------------------------------

  /** Replace a variant's quantity price-breaks. */
  async setPriceTiers(ctx: TenantContext, variantId: string, tiers: PriceTierInput[]) {
    await this.assertVariant(ctx, variantId);
    const clean = (tiers ?? [])
      .map((t) => ({ minQuantity: Math.round(Number(t.minQuantity)), priceMinor: Math.round(Number(t.priceMinor)) }))
      .filter((t) => t.minQuantity > 1 && t.priceMinor >= 0);
    await this.prisma.$transaction(async (tx) => {
      await tx.priceTier.deleteMany({ where: { variantId } });
      if (clean.length) await tx.priceTier.createMany({ data: clean.map((t) => ({ tenantId: ctx.tenantId, variantId, minQuantity: t.minQuantity, priceMinor: t.priceMinor })) });
    });
    return this.getTiers(ctx, variantId);
  }

  async getTiers(ctx: TenantContext, variantId: string) {
    await this.assertVariant(ctx, variantId);
    return this.prisma.priceTier.findMany({ where: { variantId }, orderBy: { minQuantity: 'asc' } });
  }

  /** The unit price for `qty` units of a variant, applying the best price-break. */
  async unitPriceFor(variantId: string, qty: number, basePriceMinor: number): Promise<number> {
    if (qty <= 1) return basePriceMinor;
    const tier = await this.prisma.priceTier.findFirst({
      where: { variantId, minQuantity: { lte: qty } },
      orderBy: { minQuantity: 'desc' },
    });
    return tier ? tier.priceMinor : basePriceMinor;
  }

  // --- Faceted storefront filter (P1-3) -------------------------------------

  /** Available facets for a store (brands, types, categories, price range, filterable attrs). */
  async facets(storeId: string) {
    const where = { storeId, status: 'ACTIVE' as const };
    const [brands, types, collections, priceAgg, attrs] = await Promise.all([
      this.prisma.product.findMany({ where: { ...where, brand: { not: null } }, distinct: ['brand'], select: { brand: true }, orderBy: { brand: 'asc' } }),
      this.prisma.product.findMany({ where: { ...where, productType: { not: null } }, distinct: ['productType'], select: { productType: true }, orderBy: { productType: 'asc' } }),
      this.prisma.collection.findMany({ where: { storeId }, orderBy: [{ position: 'asc' }], select: { title: true, handle: true } }),
      this.prisma.productVariant.aggregate({ where: { product: { is: where } }, _min: { priceMinor: true }, _max: { priceMinor: true } }),
      this.prisma.productAttribute.findMany({ where: { filterable: true, product: { is: where } }, select: { name: true, value: true }, orderBy: { name: 'asc' } }),
    ]);
    const attrMap = new Map<string, Set<string>>();
    for (const a of attrs) {
      if (!attrMap.has(a.name)) attrMap.set(a.name, new Set());
      attrMap.get(a.name)!.add(a.value);
    }
    return {
      brands: brands.map((b) => b.brand).filter(Boolean),
      productTypes: types.map((t) => t.productType).filter(Boolean),
      collections,
      attributes: [...attrMap.entries()].map(([name, values]) => ({ name, values: [...values].sort() })),
      priceMinMinor: priceAgg._min.priceMinor ?? 0,
      priceMaxMinor: priceAgg._max.priceMinor ?? 0,
    };
  }

  /** Filtered, sorted product list (storefront catalog browse). Returns product ids + cards. */
  async filter(storeId: string, input: FilterInput) {
    const where: Prisma.ProductWhereInput = { storeId, status: 'ACTIVE' };
    if (input.q?.trim()) {
      const q = input.q.trim();
      where.OR = [{ title: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }, { brand: { contains: q, mode: 'insensitive' } }];
    }
    if (input.brand) where.brand = input.brand;
    if (input.productType) where.productType = input.productType;
    if (input.collection) where.collections = { some: { collection: { is: { handle: input.collection } } } };
    if (input.minPriceMinor != null || input.maxPriceMinor != null) {
      where.variants = { some: { priceMinor: { gte: input.minPriceMinor ?? 0, lte: input.maxPriceMinor ?? 1_000_000_000 } } };
    }
    const attrPairs = (input.attributes ?? []).map((s) => s.split(':')).filter((p) => p.length === 2);
    if (attrPairs.length) {
      where.AND = attrPairs.map(([name, value]) => ({ attributes: { some: { name, value } } }));
    }

    const orderBy: Prisma.ProductOrderByWithRelationInput =
      input.sort === 'title' ? { title: 'asc' } : { createdAt: 'desc' };
    const products = await this.prisma.product.findMany({
      where,
      include: { variants: { orderBy: { priceMinor: 'asc' } }, images: { where: { isPrimary: true }, take: 1 } },
      orderBy,
      take: Math.min(input.limit ?? 60, 200),
    });
    let cards = products.map((p) => {
      const v = p.variants[0];
      const primary = p.images[0]?.url ?? null;
      return { id: p.id, title: p.title, brand: p.brand, priceMinor: v?.priceMinor ?? null, compareAtMinor: v?.compareAtMinor ?? null, currency: v?.currency ?? 'INR', imageUrl: primary };
    });
    // Price sorts run in JS (price is per-variant; we sorted catalog by recency above).
    if (input.sort === 'price_asc') cards = cards.sort((a, b) => (a.priceMinor ?? 0) - (b.priceMinor ?? 0));
    if (input.sort === 'price_desc') cards = cards.sort((a, b) => (b.priceMinor ?? 0) - (a.priceMinor ?? 0));
    return cards;
  }
}
