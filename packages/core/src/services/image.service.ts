import type { PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';

export interface CreateImageInput {
  storeId: string;
  url: string;
  productId?: string;
  /** Optional variant this image represents (e.g. the "Red" swatch). */
  variantId?: string;
  alt?: string;
  originalBytes?: number;
  /** Make this the product's primary (card/hero) image. */
  isPrimary?: boolean;
}

// Simulated compression ratio (optimized = 35% of original ≈ 65% saved).
const KEEP_RATIO = 0.35;

/**
 * Image optimization (TinyIMG-style). A registry of store images with a
 * one-click "optimize" that records the byte savings (compression is simulated
 * here; a real pipeline — Sharp/Squoosh/CDN — drops in behind the same fields),
 * bulk optimization, alt-text generation, and a savings summary.
 */
export class ImageService {
  constructor(private readonly prisma: PrismaClient) {}

  private async assertStore(ctx: TenantContext, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, tenantId: ctx.tenantId }, select: { id: true } });
    if (!store) throw new NotFoundError('Store', storeId);
  }

  async create(ctx: TenantContext, input: CreateImageInput) {
    await this.assertStore(ctx, input.storeId);
    if (!input.url?.trim()) throw new ValidationError('An image URL is required.');
    // originalBytes is optional now (real uploads compute it); default a nominal size.
    const originalBytes = input.originalBytes && input.originalBytes > 0 ? Math.round(input.originalBytes) : 100_000;
    if (input.productId) {
      const p = await this.prisma.product.findFirst({ where: { id: input.productId, storeId: input.storeId }, select: { id: true } });
      if (!p) throw new NotFoundError('Product', input.productId);
    }
    if (input.variantId) {
      const v = await this.prisma.productVariant.findFirst({ where: { id: input.variantId, tenantId: ctx.tenantId }, select: { id: true } });
      if (!v) throw new NotFoundError('ProductVariant', input.variantId);
    }
    // Append to the end of the product's gallery; auto-primary if it's the first.
    let position = 0;
    let isPrimary = Boolean(input.isPrimary);
    if (input.productId) {
      const agg = await this.prisma.imageAsset.aggregate({ where: { productId: input.productId }, _max: { position: true }, _count: true });
      position = (agg._max.position ?? -1) + 1;
      if (agg._count === 0) isPrimary = true; // first image is primary by default
    }
    const created = await this.prisma.imageAsset.create({
      data: {
        tenantId: ctx.tenantId,
        storeId: input.storeId,
        productId: input.productId,
        variantId: input.variantId,
        url: input.url.trim(),
        alt: input.alt,
        position,
        isPrimary,
        originalBytes,
      },
    });
    if (isPrimary && input.productId) await this.demoteOtherPrimaries(input.productId, created.id);
    return created;
  }

  /** Ordered gallery for a product (primary first, then by position). */
  async productImages(productId: string) {
    return this.prisma.imageAsset.findMany({
      where: { productId },
      orderBy: [{ isPrimary: 'desc' }, { position: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /** Make one image the product's primary (card/hero). */
  async setPrimary(ctx: TenantContext, id: string) {
    const img = await this.load(ctx, id);
    if (!img.productId) throw new ValidationError('Image is not attached to a product.');
    await this.demoteOtherPrimaries(img.productId, id);
    return this.prisma.imageAsset.update({ where: { id }, data: { isPrimary: true } });
  }

  /** Reorder a product's gallery to the given image-id order. */
  async reorder(ctx: TenantContext, productId: string, orderedIds: string[]) {
    await this.prisma.product.findFirstOrThrow({ where: { id: productId, tenantId: ctx.tenantId } }).catch(() => { throw new NotFoundError('Product', productId); });
    await this.prisma.$transaction(
      orderedIds.map((id, i) => this.prisma.imageAsset.updateMany({ where: { id, productId, tenantId: ctx.tenantId }, data: { position: i } })),
    );
    return this.productImages(productId);
  }

  private async demoteOtherPrimaries(productId: string, keepId: string) {
    await this.prisma.imageAsset.updateMany({ where: { productId, isPrimary: true, id: { not: keepId } }, data: { isPrimary: false } });
  }

  async list(ctx: TenantContext, opts: { storeId: string; productId?: string }) {
    await this.assertStore(ctx, opts.storeId);
    return this.prisma.imageAsset.findMany({
      where: { tenantId: ctx.tenantId, storeId: opts.storeId, ...(opts.productId ? { productId: opts.productId } : {}) },
      include: { product: { select: { title: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async load(ctx: TenantContext, id: string) {
    const img = await this.prisma.imageAsset.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!img) throw new NotFoundError('ImageAsset', id);
    return img;
  }

  async optimize(ctx: TenantContext, id: string) {
    const img = await this.load(ctx, id);
    if (img.optimized) return img;
    const optimizedBytes = Math.max(1, Math.floor(img.originalBytes * KEEP_RATIO));
    return this.prisma.imageAsset.update({ where: { id }, data: { optimized: true, optimizedBytes } });
  }

  /** Optimize every not-yet-optimized image in a store. Returns bytes saved. */
  async optimizeAll(ctx: TenantContext, storeId: string) {
    await this.assertStore(ctx, storeId);
    const pending = await this.prisma.imageAsset.findMany({ where: { tenantId: ctx.tenantId, storeId, optimized: false } });
    let savedBytes = 0;
    for (const img of pending) {
      const optimizedBytes = Math.max(1, Math.floor(img.originalBytes * KEEP_RATIO));
      savedBytes += img.originalBytes - optimizedBytes;
      await this.prisma.imageAsset.update({ where: { id: img.id }, data: { optimized: true, optimizedBytes } });
    }
    return { optimized: pending.length, savedBytes };
  }

  async setAlt(ctx: TenantContext, id: string, alt: string) {
    await this.load(ctx, id);
    return this.prisma.imageAsset.update({ where: { id }, data: { alt } });
  }

  async remove(ctx: TenantContext, id: string) {
    await this.load(ctx, id);
    await this.prisma.imageAsset.delete({ where: { id } });
    return { id, deleted: true };
  }

  /**
   * Generate alt text for an image from its product context. Deterministic and
   * SEO-friendly; a vision model can slot in behind this method later.
   */
  async generateAlt(ctx: TenantContext, id: string) {
    const img = await this.prisma.imageAsset.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { product: { select: { title: true, description: true } } },
    });
    if (!img) throw new NotFoundError('ImageAsset', id);
    const base = img.product?.title ?? 'Product';
    const extra = img.product?.description ? ` — ${img.product.description.split('.')[0]}` : '';
    const alt = `${base}${extra}`.slice(0, 125).trim();
    return this.prisma.imageAsset.update({ where: { id }, data: { alt } });
  }

  async savings(ctx: TenantContext, storeId: string) {
    await this.assertStore(ctx, storeId);
    const images = await this.prisma.imageAsset.findMany({
      where: { tenantId: ctx.tenantId, storeId },
      select: { originalBytes: true, optimizedBytes: true, optimized: true, alt: true },
    });
    let originalBytes = 0;
    let currentBytes = 0;
    let optimized = 0;
    let missingAlt = 0;
    for (const i of images) {
      originalBytes += i.originalBytes;
      currentBytes += i.optimized && i.optimizedBytes ? i.optimizedBytes : i.originalBytes;
      if (i.optimized) optimized++;
      if (!i.alt) missingAlt++;
    }
    return {
      total: images.length,
      optimized,
      pending: images.length - optimized,
      missingAlt,
      originalBytes,
      currentBytes,
      savedBytes: originalBytes - currentBytes,
    };
  }
}
