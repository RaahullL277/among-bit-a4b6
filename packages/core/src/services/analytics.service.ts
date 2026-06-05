import type { Prisma, PrismaClient } from '@prisma/client';
import type { TenantContext } from '../context.js';

const PAID_STATUSES = ['PAID', 'FULFILLED'] as const;
const DAY_MS = 86_400_000;

export type Interval = 'day' | 'week' | 'month';

export interface AnalyticsRange {
  storeId?: string;
  from?: string | Date;
  to?: string | Date;
}

/**
 * Read-only analytics over the commerce data: KPI summary, revenue time-series,
 * the cart→checkout→paid funnel, and top products. All queries are tenant- (and
 * optionally store-) scoped and bounded by a date range (default: last 30 days).
 */
export class AnalyticsService {
  constructor(private readonly prisma: PrismaClient) {}

  private range(input: AnalyticsRange) {
    const to = input.to ? new Date(input.to) : new Date();
    const from = input.from ? new Date(input.from) : new Date(to.getTime() - 30 * DAY_MS);
    return { from, to };
  }

  private orderWhere(ctx: TenantContext, input: AnalyticsRange, paidOnly = false): Prisma.OrderWhereInput {
    const { from, to } = this.range(input);
    return {
      tenantId: ctx.tenantId,
      ...(input.storeId ? { storeId: input.storeId } : {}),
      createdAt: { gte: from, lte: to },
      ...(paidOnly ? { status: { in: [...PAID_STATUSES] } } : {}),
    };
  }

  async summary(ctx: TenantContext, input: AnalyticsRange) {
    const { from, to } = this.range(input);
    const base = { tenantId: ctx.tenantId, ...(input.storeId ? { storeId: input.storeId } : {}) };
    const inRange = { createdAt: { gte: from, lte: to } };

    const [orders, paid, revenue, newCustomers, cartsCreated, abandoned, recovered] = await Promise.all([
      this.prisma.order.count({ where: { ...base, ...inRange } }),
      this.prisma.order.count({ where: { ...base, ...inRange, status: { in: [...PAID_STATUSES] } } }),
      this.prisma.order.aggregate({
        where: { ...base, ...inRange, status: { in: [...PAID_STATUSES] } },
        _sum: { totalMinor: true },
      }),
      this.prisma.customer.count({ where: { ...base, ...inRange } }),
      this.prisma.cart.count({ where: { ...base, ...inRange } }),
      this.prisma.cart.count({ where: { ...base, ...inRange, status: 'ABANDONED' } }),
      this.prisma.cart.count({ where: { ...base, ...inRange, status: 'RECOVERED' } }),
    ]);

    const revenueMinor = revenue._sum.totalMinor ?? 0;
    return {
      from,
      to,
      orders,
      paidOrders: paid,
      revenueMinor,
      averageOrderValueMinor: paid > 0 ? Math.round(revenueMinor / paid) : 0,
      newCustomers,
      cartsCreated,
      abandonedCarts: abandoned,
      recoveredCarts: recovered,
      // Share of orders that ended up paid.
      paymentConversion: orders > 0 ? round(paid / orders) : 0,
      // Share of carts that became paid orders.
      cartConversion: cartsCreated > 0 ? round(paid / cartsCreated) : 0,
    };
  }

  /** Revenue and order counts bucketed over time. */
  async revenueSeries(ctx: TenantContext, input: AnalyticsRange & { interval?: Interval }) {
    const interval = input.interval ?? 'day';
    const { from, to } = this.range(input);
    const orders = await this.prisma.order.findMany({
      where: this.orderWhere(ctx, input, true),
      select: { createdAt: true, totalMinor: true },
    });

    const buckets = new Map<string, { revenueMinor: number; orders: number }>();
    for (const key of bucketKeys(from, to, interval)) buckets.set(key, { revenueMinor: 0, orders: 0 });
    for (const o of orders) {
      const key = bucketKey(o.createdAt, interval);
      const b = buckets.get(key) ?? { revenueMinor: 0, orders: 0 };
      b.revenueMinor += o.totalMinor;
      b.orders += 1;
      buckets.set(key, b);
    }
    return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v }));
  }

  /** cart created → order created (checkout) → order paid. */
  async funnel(ctx: TenantContext, input: AnalyticsRange) {
    const { from, to } = this.range(input);
    const base = { tenantId: ctx.tenantId, ...(input.storeId ? { storeId: input.storeId } : {}) };
    const inRange = { createdAt: { gte: from, lte: to } };
    const [carts, checkouts, paid] = await Promise.all([
      this.prisma.cart.count({ where: { ...base, ...inRange } }),
      this.prisma.order.count({ where: { ...base, ...inRange } }),
      this.prisma.order.count({ where: { ...base, ...inRange, status: { in: [...PAID_STATUSES] } } }),
    ]);
    return [
      { stage: 'Carts', count: carts },
      { stage: 'Checkouts', count: checkouts },
      { stage: 'Paid', count: paid },
    ];
  }

  /** Best-selling products by units and revenue over the range (paid orders). */
  async topProducts(ctx: TenantContext, input: AnalyticsRange & { limit?: number }) {
    const items = await this.prisma.orderItem.findMany({
      where: { tenantId: ctx.tenantId, order: this.orderWhere(ctx, input, true) },
      select: {
        title: true,
        quantity: true,
        unitPriceMinor: true,
        variant: { select: { productId: true, product: { select: { title: true } } } },
      },
    });

    const map = new Map<string, { productId: string; title: string; units: number; revenueMinor: number }>();
    for (const it of items) {
      const productId = it.variant?.productId ?? `item:${it.title}`;
      const title = it.variant?.product?.title ?? it.title;
      const cur = map.get(productId) ?? { productId, title, units: 0, revenueMinor: 0 };
      cur.units += it.quantity;
      cur.revenueMinor += it.unitPriceMinor * it.quantity;
      map.set(productId, cur);
    }
    return [...map.values()]
      .sort((a, b) => b.revenueMinor - a.revenueMinor)
      .slice(0, input.limit ?? 10);
  }
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}

export function bucketKey(date: Date, interval: Interval): string {
  const iso = date.toISOString();
  if (interval === 'month') return iso.slice(0, 7);
  if (interval === 'week') {
    const d = new Date(date);
    const day = (d.getUTCDay() + 6) % 7; // Monday = 0
    d.setUTCDate(d.getUTCDate() - day);
    return d.toISOString().slice(0, 10);
  }
  return iso.slice(0, 10);
}

export function bucketKeys(from: Date, to: Date, interval: Interval): string[] {
  const keys: string[] = [];
  const cursor = new Date(bucketKey(from, interval) + (interval === 'month' ? '-01' : '') + 'T00:00:00Z');
  let guard = 0;
  while (cursor <= to && guard++ < 1000) {
    keys.push(bucketKey(cursor, interval));
    if (interval === 'month') cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    else cursor.setUTCDate(cursor.getUTCDate() + (interval === 'week' ? 7 : 1));
  }
  return keys;
}
