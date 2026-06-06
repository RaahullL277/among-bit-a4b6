import type { PrismaClient, ReturnReason, ReturnStatus } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';
import type { PaymentService } from './payment.service.js';
import type { NotificationService } from './notification.service.js';

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
  ) {}

  private money(minor: number, currency: string) {
    return `${(minor / 100).toFixed(2)} ${currency}`;
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
          reason: input.reason ?? 'OTHER',
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

    return created;
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
    return this.prisma.return.update({ where: { id }, data: { status: 'RECEIVED' } });
  }

  async cancel(ctx: TenantContext, id: string) {
    const row = await this.load(ctx, id);
    this.assertTransition(row.status, 'CANCELLED');
    return this.prisma.return.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  /** Refund the return through the payment adapter and close it out. */
  async refund(ctx: TenantContext, id: string, amountMinor?: number) {
    const row = await this.load(ctx, id);
    this.assertTransition(row.status, 'REFUNDED');
    const amount = amountMinor ?? row.refundMinor ?? row.order.totalMinor;
    const result = await this.payments.refund(ctx, row.orderId, amount);
    const updated = await this.prisma.return.update({
      where: { id },
      data: { status: 'REFUNDED', refundMinor: result.amountMinor, refundRef: result.refundRef },
    });
    await this.notifyCustomer(ctx, row, 'RETURN_REFUNDED', { refund: this.money(result.amountMinor, row.order.currency) });
    return updated;
  }
}
