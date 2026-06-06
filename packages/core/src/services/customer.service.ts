import type { PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';
import type { MarketingService } from './marketing.service.js';

export interface CreateCustomerInput {
  storeId: string;
  name?: string;
  email?: string;
  phone?: string;
  tags?: string[];
  notes?: string;
}

export interface UpdateCustomerInput {
  name?: string;
  email?: string;
  phone?: string;
  tags?: string[];
  notes?: string;
}

const PAID = ['PAID', 'FULFILLED'] as const;
const DAY_MS = 86_400_000;
// Heuristic segment thresholds (INR-ish defaults; tune per store later).
const VIP_SPEND_MINOR = 500_000; // ₹5,000 lifetime
const VIP_ORDERS = 5;
const AT_RISK_DAYS = 90;
const LAPSED_DAYS = 180;

export type CustomerSegment = 'NEW' | 'ONE_TIME' | 'REPEAT' | 'VIP' | 'AT_RISK' | 'LAPSED';

interface OrderStats {
  orders: number;
  totalSpentMinor: number;
  lastOrderAt: Date | null;
}

/**
 * Customers + a lightweight CRM: a 360° profile (lifetime value, orders,
 * loyalty, subscriptions, reviews, returns, support), tags & notes, search,
 * and heuristic RFM-style segments. Deep marketing CRM (flows/campaigns) is
 * still offloaded to the connected ESP (Klaviyo/Mailchimp/Brevo).
 */
export class CustomerService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly marketing?: MarketingService,
  ) {}

  private async assertStore(ctx: TenantContext, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, tenantId: ctx.tenantId }, select: { id: true } });
    if (!store) throw new NotFoundError('Store', storeId);
  }

  // --- Heuristic segmentation -----------------------------------------------

  private segment(stats: OrderStats, now = Date.now()): CustomerSegment {
    if (stats.orders === 0) return 'NEW';
    const days = stats.lastOrderAt ? (now - stats.lastOrderAt.getTime()) / DAY_MS : Infinity;
    if (days > LAPSED_DAYS) return 'LAPSED';
    if (days > AT_RISK_DAYS) return 'AT_RISK';
    if (stats.totalSpentMinor >= VIP_SPEND_MINOR || stats.orders >= VIP_ORDERS) return 'VIP';
    if (stats.orders >= 2) return 'REPEAT';
    return 'ONE_TIME';
  }

  // --- CRUD -----------------------------------------------------------------

  async create(ctx: TenantContext, input: CreateCustomerInput) {
    await this.assertStore(ctx, input.storeId);
    const customer = await this.prisma.customer.create({
      data: {
        tenantId: ctx.tenantId,
        storeId: input.storeId,
        name: input.name,
        email: input.email,
        phone: input.phone,
        tags: input.tags ?? [],
        notes: input.notes,
      },
    });
    // Best-effort sync to marketing platforms (Klaviyo/Mailchimp/Brevo).
    await this.marketing?.syncCustomer(ctx, customer.id).catch(() => undefined);
    return customer;
  }

  async update(ctx: TenantContext, id: string, patch: UpdateCustomerInput) {
    await this.get(ctx, id);
    if (patch.tags && patch.tags.some((t) => typeof t !== 'string')) throw new ValidationError('Tags must be strings.');
    const customer = await this.prisma.customer.update({
      where: { id },
      data: {
        name: patch.name,
        email: patch.email,
        phone: patch.phone,
        notes: patch.notes,
        tags: patch.tags ? Array.from(new Set(patch.tags.map((t) => t.trim()).filter(Boolean))) : undefined,
      },
    });
    if (patch.email || patch.name) await this.marketing?.syncCustomer(ctx, id).catch(() => undefined);
    return customer;
  }

  async get(ctx: TenantContext, id: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!customer) throw new NotFoundError('Customer', id);
    return customer;
  }

  // --- Marketing consent / opt-out ------------------------------------------

  /** Record (or withdraw) promotional-marketing consent. Withdrawing also
   * stamps an unsubscribe so the customer is excluded from engagement sends. */
  async setMarketingConsent(ctx: TenantContext, id: string, consent: boolean) {
    await this.get(ctx, id);
    return this.prisma.customer.update({
      where: { id },
      data: {
        marketingConsent: consent,
        marketingConsentAt: consent ? new Date() : null,
        unsubscribedAt: consent ? null : new Date(),
      },
    });
  }

  /** Public opt-in by email (newsletter/checkbox). Upserts a minimal customer. */
  async optIn(storeId: string, email: string, name?: string) {
    if (!email) throw new ValidationError('email is required.');
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { tenantId: true } });
    if (!store) throw new NotFoundError('Store', storeId);
    const existing = await this.prisma.customer.findFirst({
      where: { storeId, email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.customer.update({
        where: { id: existing.id },
        data: { marketingConsent: true, marketingConsentAt: new Date(), unsubscribedAt: null, name: name ?? undefined },
      });
    } else {
      await this.prisma.customer.create({
        data: { tenantId: store.tenantId, storeId, email, name, marketingConsent: true, marketingConsentAt: new Date() },
      });
    }
    return { optedIn: true };
  }

  /** Public unsubscribe by email (from a message footer / preferences page). */
  async unsubscribe(storeId: string, email: string) {
    if (!email) throw new ValidationError('email is required.');
    const result = await this.prisma.customer.updateMany({
      where: { storeId, email: { equals: email, mode: 'insensitive' } },
      data: { marketingConsent: false, unsubscribedAt: new Date() },
    });
    return { unsubscribed: result.count > 0 };
  }

  /** True when the customer may receive promotional messages right now. */
  static isReachableForMarketing(c: { marketingConsent: boolean; unsubscribedAt: Date | null }): boolean {
    return c.marketingConsent && !c.unsubscribedAt;
  }

  // --- List with per-customer stats + search + segment filter ---------------

  async list(ctx: TenantContext, storeId: string, opts: { search?: string; segment?: CustomerSegment } = {}) {
    await this.assertStore(ctx, storeId);
    const where: any = { tenantId: ctx.tenantId, storeId };
    if (opts.search?.trim()) {
      const q = opts.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
      ];
    }
    const customers = await this.prisma.customer.findMany({ where, orderBy: { createdAt: 'desc' }, take: 500 });
    const statsById = await this.orderStatsFor(storeId, customers.map((c) => c.id));

    const now = Date.now();
    const rows = customers.map((c) => {
      const s = statsById.get(c.id) ?? { orders: 0, totalSpentMinor: 0, lastOrderAt: null };
      return {
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        tags: c.tags,
        createdAt: c.createdAt,
        orders: s.orders,
        totalSpentMinor: s.totalSpentMinor,
        lastOrderAt: s.lastOrderAt,
        segment: this.segment(s, now),
      };
    });
    return opts.segment ? rows.filter((r) => r.segment === opts.segment) : rows;
  }

  /** Paid-order stats per customer over a store (single grouped query). */
  private async orderStatsFor(storeId: string, customerIds: string[]): Promise<Map<string, OrderStats>> {
    const out = new Map<string, OrderStats>();
    if (!customerIds.length) return out;
    const grouped = await this.prisma.order.groupBy({
      by: ['customerId'],
      where: { storeId, customerId: { in: customerIds }, status: { in: [...PAID] } },
      _sum: { totalMinor: true },
      _count: true,
      _max: { createdAt: true },
    });
    for (const g of grouped) {
      if (!g.customerId) continue;
      out.set(g.customerId, { orders: g._count, totalSpentMinor: g._sum.totalMinor ?? 0, lastOrderAt: g._max.createdAt ?? null });
    }
    return out;
  }

  // --- 360° profile ---------------------------------------------------------

  async profile(ctx: TenantContext, id: string) {
    const customer = await this.get(ctx, id);

    const [orders, loyalty, subs, reviews, returns, support] = await Promise.all([
      this.prisma.order.findMany({
        where: { customerId: id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, number: true, status: true, totalMinor: true, currency: true, createdAt: true },
      }),
      this.prisma.loyaltyAccount.findUnique({ where: { customerId: id }, select: { pointsBalance: true, tier: true, lifetimePoints: true } }),
      this.prisma.subscription.findMany({ where: { customerId: id }, select: { id: true, status: true, interval: true } }),
      this.prisma.review.count({ where: { customerId: id } }),
      this.prisma.return.count({ where: { customerId: id } }),
      this.prisma.supportConversation.findMany({
        where: { customerId: id },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: { id: true, status: true, updatedAt: true },
      }),
    ]);

    const paid = orders.filter((o) => (PAID as readonly string[]).includes(o.status));
    const totalSpentMinor = paid.reduce((s, o) => s + o.totalMinor, 0);
    const stats: OrderStats = { orders: paid.length, totalSpentMinor, lastOrderAt: paid[0]?.createdAt ?? null };
    const firstOrderAt = paid.length ? paid[paid.length - 1].createdAt : null;
    const aovMinor = paid.length ? Math.round(totalSpentMinor / paid.length) : 0;

    return {
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        tags: customer.tags,
        notes: customer.notes,
        marketingConsent: customer.marketingConsent,
        unsubscribedAt: customer.unsubscribedAt,
        createdAt: customer.createdAt,
      },
      segment: this.segment(stats),
      metrics: {
        lifetimeValueMinor: totalSpentMinor,
        paidOrders: paid.length,
        totalOrders: orders.length,
        aovMinor,
        firstOrderAt,
        lastOrderAt: stats.lastOrderAt,
        daysSinceLastOrder: stats.lastOrderAt ? Math.floor((Date.now() - stats.lastOrderAt.getTime()) / DAY_MS) : null,
        currency: orders[0]?.currency ?? 'INR',
      },
      loyalty: loyalty ? { pointsBalance: loyalty.pointsBalance, tier: loyalty.tier, lifetimePoints: loyalty.lifetimePoints } : null,
      subscriptions: { active: subs.filter((s) => s.status === 'ACTIVE').length, total: subs.length },
      reviews,
      returns,
      support: { open: support.filter((s) => s.status !== 'RESOLVED').length, recent: support },
      recentOrders: orders.slice(0, 5),
    };
  }

  // --- Store-level CRM summary ----------------------------------------------

  async summary(ctx: TenantContext, storeId: string) {
    await this.assertStore(ctx, storeId);
    const customers = await this.prisma.customer.findMany({ where: { tenantId: ctx.tenantId, storeId }, select: { id: true } });
    const stats = await this.orderStatsFor(storeId, customers.map((c) => c.id));

    const now = Date.now();
    const segments: Record<CustomerSegment, number> = { NEW: 0, ONE_TIME: 0, REPEAT: 0, VIP: 0, AT_RISK: 0, LAPSED: 0 };
    let withOrders = 0;
    let repeat = 0;
    let totalLtv = 0;
    for (const c of customers) {
      const s = stats.get(c.id) ?? { orders: 0, totalSpentMinor: 0, lastOrderAt: null };
      segments[this.segment(s, now)]++;
      if (s.orders > 0) {
        withOrders++;
        totalLtv += s.totalSpentMinor;
      }
      if (s.orders >= 2) repeat++;
    }
    return {
      customers: customers.length,
      withOrders,
      repeatRatePct: withOrders ? Math.round((repeat / withOrders) * 1000) / 10 : 0,
      avgLifetimeValueMinor: withOrders ? Math.round(totalLtv / withOrders) : 0,
      segments,
    };
  }
}
