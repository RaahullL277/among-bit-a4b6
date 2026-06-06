import { Prisma, type PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';

export interface CreateProductInput {
  storeId: string;
  title: string;
  description?: string;
  status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  variants?: VariantInput[];
}

export interface VariantInput {
  title?: string;
  sku?: string;
  priceMinor: number;
  currency?: string;
  inventory?: number;
  options?: Record<string, unknown>;
}

export interface UpdateProductInput {
  title?: string;
  description?: string;
  status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
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

    return this.prisma.product.create({
      data: {
        tenantId: ctx.tenantId,
        storeId: input.storeId,
        title: input.title,
        description: input.description,
        status: input.status ?? 'DRAFT',
        variants: {
          create: variants.map((v) => ({
            tenantId: ctx.tenantId,
            title: v.title ?? 'Default',
            sku: v.sku,
            priceMinor: v.priceMinor,
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
        metaTitle: input.metaTitle,
        metaDescription: input.metaDescription,
      },
      include: productInclude,
    });
  }
}
