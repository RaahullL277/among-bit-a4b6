import { Prisma, type PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';

export interface CreateProductInput {
  storeId: string;
  title: string;
  description?: string;
  status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  tags?: string[];
  metaTitle?: string;
  metaDescription?: string;
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
  options?: Record<string, unknown>;
}

export interface UpdateProductInput {
  title?: string;
  description?: string;
  status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  tags?: string[];
  metaTitle?: string;
  metaDescription?: string;
}

const productInclude = { variants: true } as const;

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
          })),
        },
      },
      include: productInclude,
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
      include: productInclude,
    });
    if (!product) throw new NotFoundError('Product', id);
    return product;
  }

  async update(ctx: TenantContext, id: string, input: UpdateProductInput) {
    await this.get(ctx, id);
    return this.prisma.product.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description,
        status: input.status,
        tags: input.tags,
        metaTitle: input.metaTitle,
        metaDescription: input.metaDescription,
      },
      include: productInclude,
    });
  }

  /** Edit an existing variant's price, compare-at, cost, title, or SKU. */
  async updateVariant(
    ctx: TenantContext,
    variantId: string,
    patch: { priceMinor?: number; compareAtMinor?: number | null; costMinor?: number; title?: string; sku?: string | null },
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
      },
    });
  }
}
