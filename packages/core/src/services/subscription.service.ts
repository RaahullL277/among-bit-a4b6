import type { BillingInterval, PrismaClient, SubscriptionStatus } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';
import type { PaymentService } from './payment.service.js';

const INTERVAL_DAYS: Record<BillingInterval, number> = {
  WEEKLY: 7,
  BIWEEKLY: 14,
  MONTHLY: 30,
  QUARTERLY: 90,
};

export interface SubscriptionSettingsInput {
  storeId: string;
  enabled?: boolean;
  discountPercent?: number;
  intervals?: BillingInterval[];
}

export interface CreateSubscriptionInput {
  storeId: string;
  variantId: string;
  quantity?: number;
  interval: BillingInterval;
  /** Identify the subscriber: an existing customer id or an email. */
  customerId?: string;
  email?: string;
  /** Override the store default subscribe-and-save discount. */
  discountPercent?: number;
  /** First billing date; defaults to one interval from now. */
  startAt?: Date;
}

const DEFAULT_SETTINGS = { enabled: false, discountPercent: 10, intervals: ['WEEKLY', 'MONTHLY'] as BillingInterval[] };

const subInclude = {
  variant: { include: { product: { select: { title: true } } } },
  customer: { select: { name: true, email: true } },
} as const;

/**
 * Subscriptions ("subscribe & save" / recurring orders). A subscription bills a
 * single variant at a fixed cadence; the worker generates a discounted order on
 * each due date and advances the schedule. Merchants configure the storefront
 * offer; customers manage their own subscriptions by email.
 */
export class SubscriptionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly payments: PaymentService,
  ) {}

  private addDays(from: Date, days: number) {
    return new Date(from.getTime() + days * 86_400_000);
  }

  // --- Settings -------------------------------------------------------------

  private async assertStore(ctx: TenantContext, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, tenantId: ctx.tenantId }, select: { id: true } });
    if (!store) throw new NotFoundError('Store', storeId);
  }

  async getSettings(ctx: TenantContext, storeId: string) {
    await this.assertStore(ctx, storeId);
    const row = await this.prisma.subscriptionSettings.findUnique({ where: { storeId } });
    return row ?? { storeId, ...DEFAULT_SETTINGS, isDefault: true };
  }

  private async settings(storeId: string) {
    const row = await this.prisma.subscriptionSettings.findUnique({ where: { storeId } });
    return row ?? { storeId, ...DEFAULT_SETTINGS };
  }

  async setSettings(ctx: TenantContext, input: SubscriptionSettingsInput) {
    await this.assertStore(ctx, input.storeId);
    let discountPercent: number | undefined;
    if (input.discountPercent !== undefined) {
      discountPercent = Math.round(input.discountPercent);
      if (discountPercent < 0 || discountPercent > 100) throw new ValidationError('Discount must be between 0 and 100.');
    }
    const intervals = input.intervals?.filter((i) => i in INTERVAL_DAYS);
    const data = {
      enabled: input.enabled,
      discountPercent,
      intervals: intervals as unknown as object | undefined,
    };
    return this.prisma.subscriptionSettings.upsert({
      where: { storeId: input.storeId },
      create: {
        tenantId: ctx.tenantId,
        storeId: input.storeId,
        enabled: input.enabled ?? DEFAULT_SETTINGS.enabled,
        discountPercent: discountPercent ?? DEFAULT_SETTINGS.discountPercent,
        intervals: (intervals ?? DEFAULT_SETTINGS.intervals) as unknown as object,
      },
      update: data,
    });
  }

  /** Public settings for the storefront "subscribe & save" widget. */
  async publicSettings(storeId: string) {
    const s = await this.settings(storeId);
    return { enabled: s.enabled, discountPercent: s.discountPercent, intervals: s.intervals };
  }

  // --- Create / manage ------------------------------------------------------

  private async resolveCustomer(ctx: TenantContext, storeId: string, input: { customerId?: string; email?: string }) {
    if (input.customerId) {
      const c = await this.prisma.customer.findFirst({ where: { id: input.customerId, tenantId: ctx.tenantId, storeId }, select: { id: true } });
      if (!c) throw new NotFoundError('Customer', input.customerId);
      return c.id;
    }
    if (!input.email) throw new ValidationError('A customer id or email is required.');
    const existing = await this.prisma.customer.findFirst({
      where: { storeId, email: { equals: input.email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) return existing.id;
    const created = await this.prisma.customer.create({ data: { tenantId: ctx.tenantId, storeId, email: input.email } });
    return created.id;
  }

  async create(ctx: TenantContext, input: CreateSubscriptionInput) {
    await this.assertStore(ctx, input.storeId);
    if (!(input.interval in INTERVAL_DAYS)) throw new ValidationError('Unknown billing interval.');
    const quantity = Math.round(input.quantity ?? 1);
    if (quantity <= 0) throw new ValidationError('Quantity must be positive.');

    const variant = await this.prisma.productVariant.findFirst({
      where: { id: input.variantId, tenantId: ctx.tenantId, product: { storeId: input.storeId, status: 'ACTIVE' } },
      select: { id: true },
    });
    if (!variant) throw new NotFoundError('ProductVariant', input.variantId);

    const settings = await this.settings(input.storeId);
    let discountPercent = input.discountPercent ?? settings.discountPercent;
    discountPercent = Math.max(0, Math.min(100, Math.round(discountPercent)));

    const customerId = await this.resolveCustomer(ctx, input.storeId, input);
    const nextBillingAt = input.startAt ?? this.addDays(new Date(), INTERVAL_DAYS[input.interval]);

    const sub = await this.prisma.subscription.create({
      data: {
        tenantId: ctx.tenantId,
        storeId: input.storeId,
        customerId,
        variantId: input.variantId,
        quantity,
        interval: input.interval,
        discountPercent,
        nextBillingAt,
      },
      include: subInclude,
    });
    return this.shape(sub);
  }

  async list(ctx: TenantContext, opts: { storeId?: string; status?: SubscriptionStatus; customerId?: string } = {}) {
    const rows = await this.prisma.subscription.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(opts.storeId ? { storeId: opts.storeId } : {}),
        ...(opts.status ? { status: opts.status } : {}),
        ...(opts.customerId ? { customerId: opts.customerId } : {}),
      },
      include: subInclude,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((r) => this.shape(r));
  }

  async counts(ctx: TenantContext, storeId: string) {
    const grouped = await this.prisma.subscription.groupBy({
      by: ['status'],
      where: { tenantId: ctx.tenantId, storeId },
      _count: true,
    });
    const out = { ACTIVE: 0, PAUSED: 0, CANCELLED: 0 } as Record<SubscriptionStatus, number>;
    for (const g of grouped) out[g.status] = g._count;
    return out;
  }

  private shape(r: any) {
    return {
      id: r.id,
      storeId: r.storeId,
      customerId: r.customerId,
      customerName: r.customer?.name ?? null,
      customerEmail: r.customer?.email ?? null,
      variantId: r.variantId,
      productTitle: r.variant?.product?.title ?? null,
      unitPriceMinor: r.variant?.priceMinor ?? null,
      quantity: r.quantity,
      interval: r.interval,
      discountPercent: r.discountPercent,
      status: r.status,
      nextBillingAt: r.nextBillingAt,
      cyclesCompleted: r.cyclesCompleted,
      lastOrderId: r.lastOrderId,
    };
  }

  private async load(ctx: TenantContext, id: string) {
    const sub = await this.prisma.subscription.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!sub) throw new NotFoundError('Subscription', id);
    return sub;
  }

  async setStatus(ctx: TenantContext, id: string, status: SubscriptionStatus) {
    const sub = await this.load(ctx, id);
    if (sub.status === 'CANCELLED') throw new ValidationError('This subscription is cancelled.');
    return this.prisma.subscription.update({
      where: { id },
      data: { status, canceledAt: status === 'CANCELLED' ? new Date() : null },
    });
  }

  async update(ctx: TenantContext, id: string, patch: { quantity?: number; interval?: BillingInterval; nextBillingAt?: Date; discountPercent?: number }) {
    const sub = await this.load(ctx, id);
    if (sub.status === 'CANCELLED') throw new ValidationError('This subscription is cancelled.');
    const data: Record<string, unknown> = {};
    if (patch.quantity !== undefined) {
      if (patch.quantity <= 0) throw new ValidationError('Quantity must be positive.');
      data.quantity = Math.round(patch.quantity);
    }
    if (patch.interval !== undefined) {
      if (!(patch.interval in INTERVAL_DAYS)) throw new ValidationError('Unknown billing interval.');
      data.interval = patch.interval;
    }
    if (patch.discountPercent !== undefined) data.discountPercent = Math.max(0, Math.min(100, Math.round(patch.discountPercent)));
    if (patch.nextBillingAt !== undefined) data.nextBillingAt = patch.nextBillingAt;
    return this.prisma.subscription.update({ where: { id }, data });
  }

  // --- Public (storefront) --------------------------------------------------

  /** A customer's subscriptions, looked up by email (self-service manage). */
  async listForEmail(storeId: string, email: string) {
    if (!email) return [];
    const customer = await this.prisma.customer.findFirst({
      where: { storeId, email: { equals: email, mode: 'insensitive' } },
      select: { id: true, tenantId: true },
    });
    if (!customer) return [];
    const rows = await this.prisma.subscription.findMany({
      where: { customerId: customer.id },
      include: subInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.shape(r));
  }

  /** Pause/resume/cancel by the customer, verified by email ownership. */
  async manageByEmail(storeId: string, email: string, subscriptionId: string, status: SubscriptionStatus) {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, storeId, customer: { email: { equals: email, mode: 'insensitive' } } },
    });
    if (!sub) throw new NotFoundError('Subscription', subscriptionId);
    return this.setStatus({ tenantId: sub.tenantId }, sub.id, status);
  }

  // --- Billing (worker) -----------------------------------------------------

  /**
   * Generate orders for all subscriptions due on or before `now`. Cross-tenant;
   * invoked by the worker. Each due subscription produces one discounted order
   * via the active payment provider, then its schedule advances by one interval.
   */
  /**
   * Generate orders for due subscriptions. Tenant-scoped when `tenantId` is given
   * (the merchant-triggered path only bills its own subs; the worker bills all).
   * Each cycle is **claimed** with an atomic conditional advance of nextBillingAt,
   * so a concurrent run or retry can't double-bill the same period.
   */
  async runDueSubscriptions(
    opts: { now?: Date; tenantId?: string } = {},
  ): Promise<{ processed: number; orders: number; failed: number }> {
    const now = opts.now ?? new Date();
    const due = await this.prisma.subscription.findMany({
      where: { status: 'ACTIVE', nextBillingAt: { lte: now }, ...(opts.tenantId ? { tenantId: opts.tenantId } : {}) },
      include: { variant: true },
      take: 500,
    });

    let orders = 0;
    let failed = 0;
    for (const sub of due) {
      const ctx: TenantContext = { tenantId: sub.tenantId };
      // Pause if the variant is gone.
      if (!sub.variant) {
        await this.prisma.subscription.update({ where: { id: sub.id }, data: { status: 'PAUSED' } });
        failed++;
        continue;
      }
      // Claim this cycle: only one runner can advance nextBillingAt from its
      // current value. If another run already claimed it, skip (no double-bill).
      const next = this.addDays(sub.nextBillingAt, INTERVAL_DAYS[sub.interval]);
      const claim = await this.prisma.subscription.updateMany({
        where: { id: sub.id, status: 'ACTIVE', nextBillingAt: sub.nextBillingAt },
        data: { nextBillingAt: next },
      });
      if (claim.count === 0) continue;

      try {
        const subtotal = sub.variant.priceMinor * sub.quantity;
        const discountMinor = Math.floor((subtotal * sub.discountPercent) / 100);
        const { order } = await this.payments.checkout(ctx, {
          storeId: sub.storeId,
          customerId: sub.customerId,
          items: [{ variantId: sub.variantId, quantity: sub.quantity }],
          discountMinor: discountMinor || undefined,
        });
        await this.prisma.subscription.update({
          where: { id: sub.id },
          data: { lastOrderId: order.id, cyclesCompleted: { increment: 1 } },
        });
        orders++;
      } catch {
        // Billing failed → revert the claim and pause; retried on reactivation.
        await this.prisma.subscription
          .update({ where: { id: sub.id }, data: { status: 'PAUSED', nextBillingAt: sub.nextBillingAt } })
          .catch(() => undefined);
        failed++;
      }
    }
    return { processed: due.length, orders, failed };
  }
}
