import type { PrismaClient } from '@prisma/client';
import type { TenantContext } from '../context.js';
import { getMarketTrendsProvider } from '../adapters/registry.js';
import type { MarketTrendsProvider } from '../adapters/trends.js';
import type { AnalyticsService } from './analytics.service.js';

const DAY_MS = 86_400_000;
const PAID = ['PAID', 'FULFILLED'] as const;

export interface StoreTrendsInput {
  storeId?: string;
  windowDays?: number;
  limit?: number;
}

export interface TrendMover {
  query?: string;
  productId?: string;
  title?: string;
  now: number;
  prev: number;
  delta: number;
  isNew: boolean;
}

/**
 * Trends for a store, two flavours:
 *  - storeTrends(): DETERMINISTIC internal momentum — what's rising/falling in
 *    the store's own searches and sales, this window vs the previous one.
 *  - marketTrends(): external category/segment trends via a pluggable provider
 *    (sample stub today), seeded with the store's own vocabulary.
 */
export class TrendsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly analytics?: AnalyticsService,
    private readonly provider: MarketTrendsProvider = getMarketTrendsProvider(),
  ) {}

  private norm(q: string | null): string {
    return (q ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  /** Movers & risers in the store's own searches and sales (window vs previous). */
  async storeTrends(ctx: TenantContext, input: StoreTrendsInput = {}) {
    const windowDays = Math.max(1, input.windowDays ?? 30);
    const limit = input.limit ?? 8;
    const now = new Date();
    const from = new Date(now.getTime() - windowDays * DAY_MS);
    const prevFrom = new Date(now.getTime() - 2 * windowDays * DAY_MS);
    const scope = { tenantId: ctx.tenantId, ...(input.storeId ? { storeId: input.storeId } : {}) };
    const inWindow = (d: Date) => (d >= from ? 'now' : 'prev');

    // --- Searches ---
    const searchEvents = await this.prisma.behaviorEvent.findMany({
      where: { ...scope, type: 'SEARCH', query: { not: null }, createdAt: { gte: prevFrom, lte: now } },
      select: { query: true, resultCount: true, createdAt: true },
    });
    const searchAgg = new Map<string, { now: number; prev: number; unmetNow: number }>();
    for (const e of searchEvents) {
      const q = this.norm(e.query);
      if (!q) continue;
      const a = searchAgg.get(q) ?? { now: 0, prev: 0, unmetNow: 0 };
      if (inWindow(e.createdAt) === 'now') { a.now++; if (e.resultCount === 0) a.unmetNow++; }
      else a.prev++;
      searchAgg.set(q, a);
    }
    const risingSearches = [...searchAgg.entries()]
      .map(([query, a]) => ({ query, now: a.now, prev: a.prev, delta: a.now - a.prev, isNew: a.prev === 0 && a.now > 0, unmet: a.unmetNow > 0 && a.unmetNow >= a.now / 2 }))
      .filter((m) => m.delta > 0)
      .sort((a, b) => b.delta - a.delta || b.now - a.now || a.query.localeCompare(b.query))
      .slice(0, limit);

    // --- Products (units in paid orders) ---
    const items = await this.prisma.orderItem.findMany({
      where: { tenantId: ctx.tenantId, order: { ...scope, status: { in: [...PAID] }, createdAt: { gte: prevFrom, lte: now } } },
      select: { quantity: true, title: true, order: { select: { createdAt: true } }, variant: { select: { productId: true, product: { select: { title: true } } } } },
    });
    const prodAgg = new Map<string, { title: string; now: number; prev: number }>();
    for (const it of items) {
      const productId = it.variant?.productId ?? `item:${it.title}`;
      const title = it.variant?.product?.title ?? it.title;
      const a = prodAgg.get(productId) ?? { title, now: 0, prev: 0 };
      if (inWindow(it.order.createdAt) === 'now') a.now += it.quantity;
      else a.prev += it.quantity;
      prodAgg.set(productId, a);
    }
    const products: TrendMover[] = [...prodAgg.entries()].map(([productId, a]) => ({ productId, title: a.title, now: a.now, prev: a.prev, delta: a.now - a.prev, isNew: a.prev === 0 && a.now > 0 }));
    const risingProducts = products.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta || b.now - a.now).slice(0, limit);
    const decliningProducts = products.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta || b.prev - a.prev).slice(0, limit);

    return {
      window: { from, to: now },
      previous: { from: prevFrom, to: from },
      risingSearches,
      risingProducts,
      decliningProducts,
    };
  }

  /** External category/segment trends (pluggable provider; sample stub today). */
  async marketTrends(ctx: TenantContext, input: { storeId: string; category?: string; segment?: string; region?: string }) {
    const keywords = await this.deriveKeywords(ctx, input.storeId);
    const category = input.category ?? keywords.category;
    const report = await this.provider.categoryTrends({
      category,
      segment: input.segment,
      region: input.region,
      keywords: keywords.terms,
    });
    return { ...report, basedOn: { category, keywords: keywords.terms } };
  }

  /** Seed the trends provider with the store's own vocabulary (types + hot searches). */
  private async deriveKeywords(ctx: TenantContext, storeId: string): Promise<{ category?: string; terms: string[] }> {
    const [types, collections, search] = await Promise.all([
      this.prisma.product.groupBy({ by: ['productType'], where: { storeId, productType: { not: null } }, _count: true, orderBy: { _count: { productType: 'desc' } }, take: 6 }),
      this.prisma.collection.findMany({ where: { storeId }, select: { title: true }, take: 4 }),
      this.analytics?.searchInsights(ctx, { storeId, limit: 6 }).catch(() => null),
    ]);
    const terms = new Set<string>();
    for (const t of types) if (t.productType) terms.add(this.norm(t.productType));
    for (const c of collections) if (c.title) terms.add(this.norm(c.title));
    for (const s of search?.topSearches ?? []) terms.add(s.query);
    const category = types[0]?.productType ?? collections[0]?.title ?? undefined;
    return { category: category ?? undefined, terms: [...terms].filter(Boolean).slice(0, 10) };
  }
}
