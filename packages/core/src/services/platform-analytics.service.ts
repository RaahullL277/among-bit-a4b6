import type { PrismaClient } from '@prisma/client';
import { bucketKey, bucketKeys, type Interval } from './analytics.service.js';

const PAID = ['PAID', 'FULFILLED'] as const;
const DAY_MS = 86_400_000;

export interface PlatformRange {
  from?: string | Date;
  to?: string | Date;
}

/**
 * Cross-tenant analytics for platform operators: totals, GMV, top merchants,
 * and growth. Not tenant-scoped — aggregates across every merchant. Transport
 * must enforce a platform read permission.
 */
export class PlatformAnalyticsService {
  constructor(private readonly prisma: PrismaClient) {}

  private range(input: PlatformRange) {
    const to = input.to ? new Date(input.to) : new Date();
    const from = input.from ? new Date(input.from) : new Date(to.getTime() - 30 * DAY_MS);
    return { from, to };
  }

  async overview(input: PlatformRange) {
    const { from, to } = this.range(input);
    const inRange = { createdAt: { gte: from, lte: to } };
    const paidInRange = { ...inRange, status: { in: [...PAID] } };
    const [tenants, activeTenants, suspendedTenants, stores, activeStores, newTenants, orders, paidOrders, gmv] =
      await Promise.all([
        this.prisma.tenant.count(),
        this.prisma.tenant.count({ where: { status: 'ACTIVE' } }),
        this.prisma.tenant.count({ where: { status: 'SUSPENDED' } }),
        this.prisma.store.count(),
        this.prisma.store.count({ where: { status: 'ACTIVE' } }),
        this.prisma.tenant.count({ where: inRange }),
        this.prisma.order.count({ where: inRange }),
        this.prisma.order.count({ where: paidInRange }),
        this.prisma.order.aggregate({ where: paidInRange, _sum: { totalMinor: true } }),
      ]);
    return {
      from,
      to,
      tenants,
      activeTenants,
      suspendedTenants,
      stores,
      activeStores,
      newTenants,
      orders,
      paidOrders,
      gmvMinor: gmv._sum.totalMinor ?? 0,
    };
  }

  async topMerchants(input: PlatformRange & { limit?: number }) {
    const { from, to } = this.range(input);
    const grouped = await this.prisma.order.groupBy({
      by: ['tenantId'],
      where: { status: { in: [...PAID] }, createdAt: { gte: from, lte: to } },
      _sum: { totalMinor: true },
      _count: true,
    });
    const tenants = await this.prisma.tenant.findMany({
      where: { id: { in: grouped.map((g) => g.tenantId) } },
      select: { id: true, name: true, status: true },
    });
    const byId = new Map(tenants.map((t) => [t.id, t]));
    return grouped
      .map((g) => ({
        tenantId: g.tenantId,
        name: byId.get(g.tenantId)?.name ?? '(unknown)',
        status: byId.get(g.tenantId)?.status ?? 'ACTIVE',
        gmvMinor: g._sum.totalMinor ?? 0,
        orders: g._count,
      }))
      .sort((a, b) => b.gmvMinor - a.gmvMinor)
      .slice(0, input.limit ?? 10);
  }

  async growth(input: PlatformRange & { interval?: Interval }) {
    const interval = input.interval ?? 'day';
    const { from, to } = this.range(input);
    const [tenants, orders] = await Promise.all([
      this.prisma.tenant.findMany({ where: { createdAt: { gte: from, lte: to } }, select: { createdAt: true } }),
      this.prisma.order.findMany({
        where: { status: { in: [...PAID] }, createdAt: { gte: from, lte: to } },
        select: { createdAt: true, totalMinor: true },
      }),
    ]);
    const keys = bucketKeys(from, to, interval);
    const tBuckets = new Map(keys.map((k) => [k, 0]));
    const gBuckets = new Map(keys.map((k) => [k, 0]));
    for (const t of tenants) {
      const k = bucketKey(t.createdAt, interval);
      tBuckets.set(k, (tBuckets.get(k) ?? 0) + 1);
    }
    for (const o of orders) {
      const k = bucketKey(o.createdAt, interval);
      gBuckets.set(k, (gBuckets.get(k) ?? 0) + o.totalMinor);
    }
    const sorted = (m: Map<string, number>) => [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
    return {
      newTenants: sorted(tBuckets).map(([date, count]) => ({ date, count })),
      gmv: sorted(gBuckets).map(([date, gmvMinor]) => ({ date, gmvMinor })),
    };
  }
}
