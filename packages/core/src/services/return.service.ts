import type { PrismaClient, ReturnReason, ReturnStatus } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';
import type { PaymentService } from './payment.service.js';
import type { NotificationService } from './notification.service.js';
import type { StockService } from './stock.service.js';
import type { InvoiceService } from './invoice.service.js';

export interface ReturnItemInput {
  orderItemId: string;
  quantity?: number;
}

export interface RequestReturnInput {
  orderId: string;
  reason?: ReturnReason;
  comment?: string;
  /** Customer-supplied unboxing/damage video URL (dispute evidence). */
  evidenceVideoUrl?: string;
  /** Items to return; when omitted, the whole order is returned. */
  items?: ReturnItemInput[];
}

const returnInclude = {
  items: { include: { orderItem: { select: { title: true, unitPriceMinor: true } } } },
  order: { select: { number: true, currency: true } },
} as const;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const ALL_REASONS: ReturnReason[] = ['DAMAGED', 'WRONG_ITEM', 'NOT_AS_DESCRIBED', 'NO_LONGER_NEEDED', 'OTHER'];
const POLICY_DEFAULTS = {
  enabled: true,
  returnWindowDays: 30,
  eligibleReasons: ALL_REASONS,
  restockingFeePercent: 0,
  autoApprove: false,
  cancelEnabled: true,
  cancelWindowHours: 24,
  allowCancelAfterShipment: false,
};
type ReturnPolicyShape = typeof POLICY_DEFAULTS;

// Allowed status transitions for a return.
const TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
  REQUESTED: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['RECEIVED', 'REFUNDED', 'CANCELLED'],
  RECEIVED: ['REFUNDED', 'CANCELLED'],
  REJECTED: [],
  REFUNDED: [],
  CANCELLED: [],
};

/**
 * Returns / RMA. Customers request a return against a paid order (optionally
 * with a damage/unboxing video as evidence); merchants approve/reject, mark the
 * item received, and issue a refund through the payment adapter. Notifications
 * fire at request / approval / rejection / refund.
 */
export class ReturnService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly payments: PaymentService,
    private readonly notifications: NotificationService,
    private readonly stock?: StockService,
    private readonly invoices?: InvoiceService,
  ) {}

  private money(minor: number, currency: string) {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }

  // --- Policy (return & cancellation rules) ---------------------------------

  private async assertStore(ctx: TenantContext, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, tenantId: ctx.tenantId }, select: { id: true } });
    if (!store) throw new NotFoundError('Store', storeId);
  }

  /** Effective policy for a store (row, or built-in defaults). */
  private async resolvePolicy(storeId: string): Promise<ReturnPolicyShape> {
    const row = await this.prisma.returnPolicy.findUnique({ where: { storeId } });
    return row
      ? {
          enabled: row.enabled,
          returnWindowDays: row.returnWindowDays,
          eligibleReasons: row.eligibleReasons,
          restockingFeePercent: row.restockingFeePercent,
          autoApprove: row.autoApprove,
          cancelEnabled: row.cancelEnabled,
          cancelWindowHours: row.cancelWindowHours,
          allowCancelAfterShipment: row.allowCancelAfterShipment,
        }
      : { ...POLICY_DEFAULTS };
  }

  async getPolicy(ctx: TenantContext, storeId: string) {
    await this.assertStore(ctx, storeId);
    const row = await this.prisma.returnPolicy.findUnique({ where: { storeId } });
    return row ?? { storeId, ...POLICY_DEFAULTS, isDefault: true };
  }

  async setPolicy(ctx: TenantContext, input: { storeId: string } & Partial<ReturnPolicyShape>) {
    await this.assertStore(ctx, input.storeId);
    const { storeId, ...rest } = input;
    if (rest.restockingFeePercent != null && (rest.restockingFeePercent < 0 || rest.restockingFeePercent > 100)) {
      throw new ValidationError('restockingFeePercent must be between 0 and 100.');
    }
    if (rest.eligibleReasons) rest.eligibleReasons = rest.eligibleReasons.filter((r) => ALL_REASONS.includes(r));
    return this.prisma.returnPolicy.upsert({
      where: { storeId },
      create: { tenantId: ctx.tenantId, storeId, ...POLICY_DEFAULTS, ...rest },
      update: rest,
    });
  }

  /** Buyer-facing policy (what the storefront shows: window, reasons, cancellation). */
  async publicPolicy(storeId: string) {
    const p = await this.resolvePolicy(storeId);
    return {
      returnsEnabled: p.enabled,
      returnWindowDays: p.returnWindowDays,
      eligibleReasons: p.eligibleReasons,
      restockingFeePercent: p.restockingFeePercent,
      cancelEnabled: p.cancelEnabled,
      cancelWindowHours: p.cancelWindowHours,
      allowCancelAfterShipment: p.allowCancelAfterShipment,
    };
  }

  // --- Create ---------------------------------------------------------------

  async request(ctx: TenantContext, input: RequestReturnInput) {
    const order = await this.prisma.order.findFirst({
      where: { id: input.orderId, tenantId: ctx.tenantId },
      include: { items: true, customer: true, store: { select: { name: true } } },
    });
    if (!order) throw new NotFoundError('Order', input.orderId);
    if (!['PAID', 'FULFILLED'].includes(order.status)) {
      throw new ValidationError('Only a paid order can be returned.');
    }

    // Enforce the store's return policy.
    const policy = await this.resolvePolicy(order.storeId);
    if (!policy.enabled) throw new ValidationError('This store does not accept returns.');
    if (policy.returnWindowDays > 0) {
      const deadline = order.createdAt.getTime() + policy.returnWindowDays * DAY_MS;
      if (Date.now() > deadline) throw new ValidationError(`The ${policy.returnWindowDays}-day return window has closed for this order.`);
    }
    const reason = input.reason ?? 'OTHER';
    if (!policy.eligibleReasons.includes(reason)) {
      throw new ValidationError('That return reason is not accepted by this store.');
    }

    // Resolve the returned lines: explicit selection, or the whole order.
    const byId = new Map(order.items.map((i) => [i.id, i]));
    const requested =
      input.items?.length
        ? input.items
        : order.items.map((i) => ({ orderItemId: i.id, quantity: i.quantity }));

    const lines = requested.map((r) => {
      const item = byId.get(r.orderItemId);
      if (!item) throw new ValidationError(`Order item ${r.orderItemId} is not part of this order.`);
      const qty = Math.round(Number(r.quantity ?? item.quantity));
      if (qty <= 0 || qty > item.quantity) {
        throw new ValidationError(`Invalid return quantity for "${item.title}".`);
      }
      return { orderItemId: item.id, quantity: qty, unitPriceMinor: item.unitPriceMinor };
    });
    const refundMinor = lines.reduce((s, l) => s + l.unitPriceMinor * l.quantity, 0);

    const created = await this.prisma.$transaction(async (tx) => {
      const last = await tx.return.aggregate({ where: { storeId: order.storeId }, _max: { number: true } });
      const number = (last._max.number ?? 0) + 1;
      return tx.return.create({
        data: {
          tenantId: ctx.tenantId,
          storeId: order.storeId,
          orderId: order.id,
          customerId: order.customerId,
          number,
          status: policy.autoApprove ? 'APPROVED' : 'REQUESTED',
          reason,
          comment: input.comment,
          evidenceVideoUrl: input.evidenceVideoUrl,
          refundMinor,
          items: { create: lines.map((l) => ({ tenantId: ctx.tenantId, orderItemId: l.orderItemId, quantity: l.quantity })) },
        },
        include: returnInclude,
      });
    });

    // Notify the store owner (best-effort).
    await this.notifications
      .notify(ctx, {
        storeId: order.storeId,
        event: 'RETURN_REQUESTED',
        recipientType: 'STORE_OWNER',
        data: { returnNumber: created.number, orderNumber: order.number, reason: created.reason },
      })
      .catch(() => undefined);

    // Auto-approved by policy → tell the customer they can ship it back.
    if (policy.autoApprove) {
      const withCustomer = await this.load(ctx, created.id);
      await this.notifyCustomer(ctx, withCustomer, 'RETURN_APPROVED').catch(() => undefined);
    }

    return created;
  }

  // --- Buyer self-cancellation ----------------------------------------------

  /** Whether an order is cancellable by the buyer right now (display hint). */
  cancelEligibility(
    order: { status: string; createdAt: Date; shipment?: unknown | null },
    policy: ReturnPolicyShape,
    now = Date.now(),
  ): { ok: boolean; reason?: string } {
    if (!policy.cancelEnabled) return { ok: false, reason: 'cancellation_disabled' };
    if (!['PENDING', 'PAID'].includes(order.status)) return { ok: false, reason: 'not_cancellable_status' };
    if (order.shipment && !policy.allowCancelAfterShipment) return { ok: false, reason: 'already_shipped' };
    if (policy.cancelWindowHours > 0 && now - order.createdAt.getTime() > policy.cancelWindowHours * HOUR_MS) {
      return { ok: false, reason: 'cancel_window_closed' };
    }
    return { ok: true };
  }

  /** Public storefront path: a buyer cancels their own order (number + email).
   * Refunds automatically when the order was already paid. */
  async cancelOrderByCustomer(storeId: string, orderNumber: number, email: string) {
    if (!orderNumber || !email) throw new ValidationError('Order number and email are required.');
    const order = await this.prisma.order.findFirst({
      where: { storeId, number: Number(orderNumber), customer: { email: { equals: email, mode: 'insensitive' } } },
      include: { payment: true, shipment: { select: { id: true } } },
    });
    if (!order) throw new NotFoundError('Order', `#${orderNumber}`);
    const policy = await this.resolvePolicy(storeId);

    const elig = this.cancelEligibility(order, policy);
    if (!elig.ok) {
      const messages: Record<string, string> = {
        cancellation_disabled: 'Online cancellation isn’t available for this store — please contact support.',
        not_cancellable_status: 'This order can no longer be cancelled.',
        already_shipped: 'Your order has already shipped and can’t be cancelled.',
        cancel_window_closed: `The ${policy.cancelWindowHours}-hour cancellation window has closed.`,
      };
      throw new ValidationError(messages[elig.reason!] ?? 'This order can’t be cancelled.');
    }

    const ctx: TenantContext = { tenantId: order.tenantId };
    let refunded = false;
    const wasPaid = order.status === 'PAID';
    if (wasPaid && (order.payment?.status === 'CAPTURED' || order.payment?.status === 'PARTIALLY_REFUNDED')) {
      const r = await this.payments.refund(ctx, order.id); // refund the remaining balance
      refunded = true;
      // Credit note for the buyer-initiated cancellation refund.
      await this.invoices
        ?.generateCreditNote(ctx, order.id, { refundMinor: r.amountMinor, reason: 'Order cancelled by customer' })
        .catch(() => undefined);
    }
    // Refund may have set the order to REFUNDED; mark it cancelled (the buyer's intent).
    await this.prisma.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } });
    // A paid order consumed stock at capture (restore it); an unpaid one only held
    // a reservation (release it).
    if (wasPaid) await this.stock?.restoreOrder(order.id).catch(() => undefined);
    else await this.stock?.releaseReservations(order.id).catch(() => undefined);
    await this.notifications.notifyOrderEvent(ctx, order.id, 'ORDER_STATUS_CHANGED').catch(() => undefined);

    return { cancelled: true, refunded, orderNumber: order.number };
  }

  /** Public storefront path: verify the order by number + email, then create. */
  async requestPublic(
    storeId: string,
    input: { orderNumber: number; email: string; reason?: ReturnReason; comment?: string; evidenceVideoUrl?: string; items?: ReturnItemInput[] },
  ) {
    if (!input.orderNumber || !input.email) throw new ValidationError('Order number and email are required.');
    const order = await this.prisma.order.findFirst({
      where: {
        storeId,
        number: Number(input.orderNumber),
        customer: { email: { equals: input.email, mode: 'insensitive' } },
      },
      select: { id: true, tenantId: true },
    });
    if (!order) throw new NotFoundError('Order', `#${input.orderNumber}`);
    const created = await this.request(
      { tenantId: order.tenantId },
      { orderId: order.id, reason: input.reason, comment: input.comment, evidenceVideoUrl: input.evidenceVideoUrl, items: input.items },
    );
    return { id: created.id, number: created.number, status: created.status };
  }

  // --- Read -----------------------------------------------------------------

  async list(ctx: TenantContext, opts: { storeId?: string; status?: ReturnStatus; orderId?: string } = {}) {
    const rows = await this.prisma.return.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(opts.storeId ? { storeId: opts.storeId } : {}),
        ...(opts.status ? { status: opts.status } : {}),
        ...(opts.orderId ? { orderId: opts.orderId } : {}),
      },
      include: returnInclude,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((r) => this.shape(r));
  }

  async get(ctx: TenantContext, id: string) {
    const row = await this.prisma.return.findFirst({ where: { id, tenantId: ctx.tenantId }, include: returnInclude });
    if (!row) throw new NotFoundError('Return', id);
    return this.shape(row);
  }

  async counts(ctx: TenantContext, storeId: string) {
    const grouped = await this.prisma.return.groupBy({
      by: ['status'],
      where: { tenantId: ctx.tenantId, storeId },
      _count: true,
    });
    const out = { REQUESTED: 0, APPROVED: 0, REJECTED: 0, RECEIVED: 0, REFUNDED: 0, CANCELLED: 0 } as Record<ReturnStatus, number>;
    for (const g of grouped) out[g.status] = g._count;
    return out;
  }

  private shape(r: any) {
    return {
      id: r.id,
      number: r.number,
      orderId: r.orderId,
      orderNumber: r.order.number,
      currency: r.order.currency,
      status: r.status,
      reason: r.reason,
      comment: r.comment,
      evidenceVideoUrl: r.evidenceVideoUrl,
      merchantNote: r.merchantNote,
      refundMinor: r.refundMinor,
      refundRef: r.refundRef,
      createdAt: r.createdAt,
      items: r.items.map((i: any) => ({ orderItemId: i.orderItemId, title: i.orderItem.title, quantity: i.quantity, unitPriceMinor: i.orderItem.unitPriceMinor })),
    };
  }

  // --- Transitions ----------------------------------------------------------

  private async load(ctx: TenantContext, id: string) {
    const row = await this.prisma.return.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { order: { include: { customer: true } } },
    });
    if (!row) throw new NotFoundError('Return', id);
    return row;
  }

  private assertTransition(from: ReturnStatus, to: ReturnStatus) {
    if (!TRANSITIONS[from].includes(to)) {
      throw new ValidationError(`Cannot move a return from ${from} to ${to}.`);
    }
  }

  private async notifyCustomer(
    ctx: TenantContext,
    row: { storeId: string; number: number; order: { number: number; customer: { name: string | null; email: string | null; phone: string | null } | null } },
    event: 'RETURN_APPROVED' | 'RETURN_REJECTED' | 'RETURN_REFUNDED',
    extra: Record<string, unknown> = {},
  ) {
    await this.notifications
      .notify(ctx, {
        storeId: row.storeId,
        event,
        recipientType: 'CUSTOMER',
        data: {
          returnNumber: row.number,
          orderNumber: row.order.number,
          customerName: row.order.customer?.name ?? 'there',
          customerEmail: row.order.customer?.email ?? undefined,
          customerPhone: row.order.customer?.phone ?? undefined,
          ...extra,
        },
      })
      .catch(() => undefined);
  }

  async approve(ctx: TenantContext, id: string, note?: string) {
    const row = await this.load(ctx, id);
    this.assertTransition(row.status, 'APPROVED');
    const updated = await this.prisma.return.update({ where: { id }, data: { status: 'APPROVED', merchantNote: note ?? row.merchantNote } });
    await this.notifyCustomer(ctx, row, 'RETURN_APPROVED');
    return updated;
  }

  async reject(ctx: TenantContext, id: string, note?: string) {
    const row = await this.load(ctx, id);
    this.assertTransition(row.status, 'REJECTED');
    const updated = await this.prisma.return.update({ where: { id }, data: { status: 'REJECTED', merchantNote: note ?? row.merchantNote } });
    await this.notifyCustomer(ctx, row, 'RETURN_REJECTED', { merchantNote: note ?? '' });
    return updated;
  }

  async markReceived(ctx: TenantContext, id: string) {
    const row = await this.load(ctx, id);
    this.assertTransition(row.status, 'RECEIVED');
    const updated = await this.prisma.return.update({ where: { id }, data: { status: 'RECEIVED' } });
    // Returned items are back in the warehouse → restock (skips damaged goods).
    await this.stock?.restoreReturn(id).catch(() => undefined);
    return updated;
  }

  async cancel(ctx: TenantContext, id: string) {
    const row = await this.load(ctx, id);
    this.assertTransition(row.status, 'CANCELLED');
    return this.prisma.return.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  /** Refund the return through the payment adapter and close it out. A
   * restocking fee (per the store policy) is deducted unless the merchant
   * passes an explicit amount. */
  async refund(ctx: TenantContext, id: string, amountMinor?: number) {
    const row = await this.load(ctx, id);
    this.assertTransition(row.status, 'REFUNDED');
    const gross = row.refundMinor ?? row.order.totalMinor;
    const policy = await this.resolvePolicy(row.storeId);
    const net = policy.restockingFeePercent > 0 ? Math.round(gross * (1 - policy.restockingFeePercent / 100)) : gross;
    const amount = amountMinor ?? Math.max(1, net);
    const result = await this.payments.refund(ctx, row.orderId, amount);
    const updated = await this.prisma.return.update({
      where: { id },
      data: { status: 'REFUNDED', refundMinor: result.amountMinor, refundRef: result.refundRef },
    });
    // Issue a GST credit note reversing the proportional tax (idempotent per return).
    await this.invoices
      ?.generateCreditNote(ctx, row.orderId, { refundMinor: result.amountMinor, returnId: id, reason: `Return ${row.number}` })
      .catch(() => undefined);
    await this.notifyCustomer(ctx, row, 'RETURN_REFUNDED', { refund: this.money(result.amountMinor, row.order.currency) });
    return updated;
  }
}
