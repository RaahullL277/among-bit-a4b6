import type { PrismaClient, ReviewStatus } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';

export interface SubmitReviewInput {
  storeId: string;
  productId: string;
  rating: number;
  authorName: string;
  authorEmail?: string;
  title?: string;
  body?: string;
  /** Optional order verification (number + email used) to mark the review verified. */
  orderNumber?: number;
  orderEmail?: string;
}

export interface RatingSummary {
  average: number;
  count: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

/**
 * Product reviews with merchant moderation (judge.me-style). Buyers submit
 * reviews (pending by default); merchants approve/reject and may reply. Only
 * approved reviews and aggregate ratings are exposed publicly.
 */
export class ReviewService {
  constructor(private readonly prisma: PrismaClient) {}

  // --- Public (storefront) --------------------------------------------------

  async submit(input: SubmitReviewInput) {
    const rating = Math.round(Number(input.rating));
    if (!(rating >= 1 && rating <= 5)) throw new ValidationError('Rating must be between 1 and 5.');
    if (!input.authorName?.trim()) throw new ValidationError('A name is required.');

    const product = await this.prisma.product.findFirst({
      where: { id: input.productId, storeId: input.storeId, status: 'ACTIVE' },
    });
    if (!product) throw new NotFoundError('Product', input.productId);

    // Verify the review is tied to a real paid order of this product.
    let verified = false;
    let customerId: string | undefined;
    if (input.orderNumber && input.orderEmail) {
      const order = await this.prisma.order.findFirst({
        where: {
          storeId: input.storeId,
          number: Number(input.orderNumber),
          status: { in: ['PAID', 'FULFILLED'] },
          customer: { email: { equals: input.orderEmail, mode: 'insensitive' } },
          items: { some: { variant: { productId: product.id } } },
        },
        include: { customer: true },
      });
      if (order) {
        verified = true;
        customerId = order.customerId ?? undefined;
      }
    }

    const review = await this.prisma.review.create({
      data: {
        tenantId: product.tenantId,
        storeId: input.storeId,
        productId: product.id,
        customerId,
        authorName: input.authorName.trim(),
        authorEmail: input.authorEmail,
        rating,
        title: input.title,
        body: input.body,
        verified,
      },
    });
    return { id: review.id, status: review.status, verified: review.verified };
  }

  /** Approved reviews + aggregate for a product. */
  async listForProduct(storeId: string, productId: string) {
    const reviews = await this.prisma.review.findMany({
      where: { storeId, productId, status: 'APPROVED' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        authorName: true,
        rating: true,
        title: true,
        body: true,
        verified: true,
        merchantReply: true,
        createdAt: true,
      },
    });
    return { summary: this.summarize(reviews.map((r) => r.rating)), reviews };
  }

  /** Aggregate rating per product (for storefront grids/badges). */
  async summariesForStore(storeId: string, productIds?: string[]) {
    const grouped = await this.prisma.review.groupBy({
      by: ['productId'],
      where: { storeId, status: 'APPROVED', ...(productIds?.length ? { productId: { in: productIds } } : {}) },
      _avg: { rating: true },
      _count: true,
    });
    const out: Record<string, { average: number; count: number }> = {};
    for (const g of grouped) {
      out[g.productId] = { average: Math.round((g._avg.rating ?? 0) * 10) / 10, count: g._count };
    }
    return out;
  }

  private summarize(ratings: number[]): RatingSummary {
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as RatingSummary['distribution'];
    for (const r of ratings) distribution[Math.min(5, Math.max(1, r)) as 1 | 2 | 3 | 4 | 5]++;
    const count = ratings.length;
    const average = count ? Math.round((ratings.reduce((a, b) => a + b, 0) / count) * 10) / 10 : 0;
    return { average, count, distribution };
  }

  // --- Merchant moderation --------------------------------------------------

  async list(ctx: TenantContext, opts: { storeId?: string; status?: ReviewStatus; productId?: string } = {}) {
    const rows = await this.prisma.review.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(opts.storeId ? { storeId: opts.storeId } : {}),
        ...(opts.status ? { status: opts.status } : {}),
        ...(opts.productId ? { productId: opts.productId } : {}),
      },
      include: { product: { select: { title: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((r) => ({
      id: r.id,
      productId: r.productId,
      productTitle: r.product.title,
      authorName: r.authorName,
      rating: r.rating,
      title: r.title,
      body: r.body,
      status: r.status,
      verified: r.verified,
      merchantReply: r.merchantReply,
      createdAt: r.createdAt,
    }));
  }

  async counts(ctx: TenantContext, storeId: string) {
    const grouped = await this.prisma.review.groupBy({
      by: ['status'],
      where: { tenantId: ctx.tenantId, storeId },
      _count: true,
    });
    const out = { PENDING: 0, APPROVED: 0, REJECTED: 0 } as Record<ReviewStatus, number>;
    for (const g of grouped) out[g.status] = g._count;
    return out;
  }

  async moderate(ctx: TenantContext, id: string, status: ReviewStatus) {
    await this.assert(ctx, id);
    return this.prisma.review.update({ where: { id }, data: { status } });
  }

  async reply(ctx: TenantContext, id: string, body: string) {
    await this.assert(ctx, id);
    if (!body?.trim()) throw new ValidationError('Reply body is required.');
    return this.prisma.review.update({ where: { id }, data: { merchantReply: body, repliedAt: new Date() } });
  }

  private async assert(ctx: TenantContext, id: string) {
    const r = await this.prisma.review.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true } });
    if (!r) throw new NotFoundError('Review', id);
  }
}
