import { Prisma, type PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';

/** Merchandising fields shared by create + update. */
export interface ProductMerchInput {
  brand?: string | null;
  productType?: string | null;
  countryOfOrigin?: string | null;
  ingredients?: string | null;
  warrantyMonths?: number | null;
  warrantyTerms?: string | null;
  moq?: number | null;
  leadTimeDays?: number | null;
}

export interface CreateProductInput extends ProductMerchInput {
  storeId: string;
  title: string;
  description?: string;
  status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  tags?: string[];
  metaTitle?: string;
  metaDescription?: string;
  /** HSN/SAC code printed per line on the GST tax invoice. */
  hsnCode?: string | null;
  /** Per-product GST rate in basis points (1800 = 18%); falls back to store rate. */
  gstRateBps?: number | null;
  variants?: VariantInput[];
}

export interface VariantInput {
  title?: string;
  sku?: string;
  priceMinor: number;
  compareAtMinor?: number;
  costMinor?: number;
  currency?: string;
  inventory?: number;
  /** Map of option name → value, e.g. { Size: "M", Color: "Red" }. */
  options?: Record<string, unknown>;
  barcode?: string | null;
  weightGrams?: number | null;
  lengthMm?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
  batchNumber?: string | null;
  expiryAt?: string | Date | null;
}

export interface UpdateProductInput extends ProductMerchInput {
  title?: string;
  description?: string;
  status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  tags?: string[];
  metaTitle?: string;
  metaDescription?: string;
  hsnCode?: string | null;
  gstRateBps?: number | null;
}

const productInclude = { variants: true } as const;

// Full merchandising graph for a product detail view.
const productDetailInclude: Prisma.ProductInclude = {
  variants: { include: { images: { orderBy: { position: 'asc' } }, priceTiers: { orderBy: { minQuantity: 'asc' } } } },
  images: { orderBy: [{ isPrimary: 'desc' }, { position: 'asc' }] },
  options: { orderBy: { position: 'asc' }, include: { values: { orderBy: { position: 'asc' } } } },
  attributes: { orderBy: { position: 'asc' } },
  assets: { orderBy: { position: 'asc' } },
  collections: { include: { collection: { select: { id: true, title: true, handle: true } } } },
};

function merchData(input: ProductMerchInput, creating: boolean) {
  const u = <T>(v: T | undefined) => (v === undefined ? undefined : v);
  return {
    brand: creating ? input.brand ?? undefined : u(input.brand),
    productType: creating ? input.productType ?? undefined : u(input.productType),
    countryOfOrigin: creating ? input.countryOfOrigin ?? undefined : u(input.countryOfOrigin),
    ingredients: creating ? input.ingredients ?? undefined : u(input.ingredients),
    warrantyMonths: creating ? input.warrantyMonths ?? undefined : u(input.warrantyMonths),
    warrantyTerms: creating ? input.warrantyTerms ?? undefined : u(input.warrantyTerms),
    moq: creating ? input.moq ?? undefined : u(input.moq),
    leadTimeDays: creating ? input.leadTimeDays ?? undefined : u(input.leadTimeDays),
  };
}

function variantData(v: VariantInput) {
  return {
    barcode: v.barcode ?? undefined,
    weightGrams: v.weightGrams ?? undefined,
    lengthMm: v.lengthMm ?? undefined,
    widthMm: v.widthMm ?? undefined,
    heightMm: v.heightMm ?? undefined,
    batchNumber: v.batchNumber ?? undefined,
    expiryAt: v.expiryAt ? new Date(v.expiryAt) : undefined,
  };
}

export class ProductService {
  constructor(private readonly prisma: PrismaClient) {}

  private async assertStore(ctx: TenantContext, storeId: string) {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!store) throw new NotFoundError('Store', storeId);
  }

  async create(ctx: TenantContext, input: CreateProductInput) {
    await this.assertStore(ctx, input.storeId);
    const variants = input.variants ?? [{ priceMinor: 0 }];
    if (variants.some((v) => v.priceMinor == null || v.priceMinor < 0)) {
      throw new ValidationError('Each variant requires a non-negative priceMinor.');
    }
    if (variants.some((v) => v.compareAtMinor != null && v.compareAtMinor < v.priceMinor)) {
      throw new ValidationError('compareAtMinor (the "was" price) must be at least the selling price.');
    }
    if (input.gstRateBps != null && (input.gstRateBps < 0 || input.gstRateBps > 10000)) {
      throw new ValidationError('gstRateBps must be between 0 and 10000.');
    }

    return this.prisma.product.create({
      data: {
        tenantId: ctx.tenantId,
        storeId: input.storeId,
        title: input.title,
        description: input.description,
        status: input.status ?? 'DRAFT',
        tags: input.tags ?? [],
        metaTitle: input.metaTitle,
        metaDescription: input.metaDescription,
        hsnCode: input.hsnCode ?? undefined,
        gstRateBps: input.gstRateBps ?? undefined,
        ...merchData(input, true),
        variants: {
          create: variants.map((v) => ({
            tenantId: ctx.tenantId,
            title: v.title ?? 'Default',
            sku: v.sku,
            priceMinor: v.priceMinor,
            compareAtMinor: v.compareAtMinor,
            costMinor: v.costMinor ?? 0,
            currency: v.currency ?? 'INR',
            inventory: v.inventory ?? 0,
            options: (v.options ?? undefined) as Prisma.InputJsonValue | undefined,
            ...variantData(v),
          })),
        },
      },
      include: productInclude,
    });
  }

  /** Add a variant to an existing product (for the variant matrix). */
  async addVariant(ctx: TenantContext, productId: string, v: VariantInput) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, tenantId: ctx.tenantId }, select: { id: true } });
    if (!product) throw new NotFoundError('Product', productId);
    if (v.priceMinor == null || v.priceMinor < 0) throw new ValidationError('A non-negative priceMinor is required.');
    if (v.compareAtMinor != null && v.compareAtMinor < v.priceMinor) throw new ValidationError('compareAtMinor must be at least the selling price.');
    return this.prisma.productVariant.create({
      data: {
        tenantId: ctx.tenantId,
        productId,
        title: v.title ?? 'Default',
        sku: v.sku,
        priceMinor: v.priceMinor,
        compareAtMinor: v.compareAtMinor,
        costMinor: v.costMinor ?? 0,
        currency: v.currency ?? 'INR',
        inventory: v.inventory ?? 0,
        options: (v.options ?? undefined) as Prisma.InputJsonValue | undefined,
        ...variantData(v),
      },
    });
  }

  async list(ctx: TenantContext, storeId: string) {
    await this.assertStore(ctx, storeId);
    return this.prisma.product.findMany({
      where: { tenantId: ctx.tenantId, storeId },
      include: productInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(ctx: TenantContext, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: productDetailInclude,
    });
    if (!product) throw new NotFoundError('Product', id);
    return product;
  }

  async update(ctx: TenantContext, id: string, input: UpdateProductInput) {
    await this.prisma.product.findFirstOrThrow({ where: { id, tenantId: ctx.tenantId } }).catch(() => { throw new NotFoundError('Product', id); });
    if (input.gstRateBps != null && (input.gstRateBps < 0 || input.gstRateBps > 10000)) {
      throw new ValidationError('gstRateBps must be between 0 and 10000.');
    }
    return this.prisma.product.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description,
        status: input.status,
        tags: input.tags,
        metaTitle: input.metaTitle,
        metaDescription: input.metaDescription,
        hsnCode: input.hsnCode === undefined ? undefined : input.hsnCode,
        gstRateBps: input.gstRateBps === undefined ? undefined : input.gstRateBps,
        ...merchData(input, false),
      },
      include: productInclude,
    });
  }

  /** Edit an existing variant's price, compare-at, cost, title, SKU, options, or logistics fields. */
  async updateVariant(
    ctx: TenantContext,
    variantId: string,
    patch: { priceMinor?: number; compareAtMinor?: number | null; costMinor?: number; title?: string; sku?: string | null; options?: Record<string, unknown> } & Partial<VariantInput>,
  ) {
    const variant = await this.prisma.productVariant.findFirst({ where: { id: variantId, tenantId: ctx.tenantId } });
    if (!variant) throw new NotFoundError('ProductVariant', variantId);
    const priceMinor = patch.priceMinor ?? variant.priceMinor;
    if (patch.priceMinor != null && patch.priceMinor < 0) throw new ValidationError('priceMinor must be non-negative.');
    if (patch.costMinor != null && patch.costMinor < 0) throw new ValidationError('costMinor must be non-negative.');
    const compareAtMinor = patch.compareAtMinor === undefined ? variant.compareAtMinor : patch.compareAtMinor;
    if (compareAtMinor != null && compareAtMinor < priceMinor) {
      throw new ValidationError('compareAtMinor (the "was" price) must be at least the selling price.');
    }
    return this.prisma.productVariant.update({
      where: { id: variantId },
      data: {
        priceMinor: patch.priceMinor ?? undefined,
        compareAtMinor: patch.compareAtMinor === undefined ? undefined : patch.compareAtMinor,
        costMinor: patch.costMinor ?? undefined,
        title: patch.title ?? undefined,
        sku: patch.sku === undefined ? undefined : patch.sku,
        options: patch.options === undefined ? undefined : (patch.options as Prisma.InputJsonValue),
        barcode: patch.barcode === undefined ? undefined : patch.barcode,
        weightGrams: patch.weightGrams === undefined ? undefined : patch.weightGrams,
        lengthMm: patch.lengthMm === undefined ? undefined : patch.lengthMm,
        widthMm: patch.widthMm === undefined ? undefined : patch.widthMm,
        heightMm: patch.heightMm === undefined ? undefined : patch.heightMm,
        batchNumber: patch.batchNumber === undefined ? undefined : patch.batchNumber,
        expiryAt: patch.expiryAt === undefined ? undefined : patch.expiryAt ? new Date(patch.expiryAt) : null,
      },
    });
  }
}
