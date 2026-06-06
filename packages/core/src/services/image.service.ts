import type { PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';

export interface CreateImageInput {
  storeId: string;
  url: string;
  productId?: string;
  alt?: string;
  originalBytes: number;
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
    const originalBytes = Math.round(input.originalBytes);
    if (!Number.isFinite(originalBytes) || originalBytes <= 0) throw new ValidationError('originalBytes must be a positive number.');
    if (input.productId) {
      const p = await this.prisma.product.findFirst({ where: { id: input.productId, storeId: input.storeId }, select: { id: true } });
      if (!p) throw new NotFoundError('Product', input.productId);
    }
    return this.prisma.imageAsset.create({
      data: {
        tenantId: ctx.tenantId,
        storeId: input.storeId,
        productId: input.productId,
        url: input.url.trim(),
        alt: input.alt,
        originalBytes,
      },
    });
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
