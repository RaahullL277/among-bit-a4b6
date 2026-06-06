import type { OrderStatus, PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';
import type { NotificationService } from './notification.service.js';
import type { StockService } from './stock.service.js';

const orderInclude = { items: true, payment: true, customer: true } as const;

// Allowed merchant-driven order status transitions (CANCELLED/REFUNDED are terminal).
const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['PAID', 'CANCELLED'],
  PAID: ['FULFILLED', 'CANCELLED', 'REFUNDED'],
  FULFILLED: ['REFUNDED', 'CANCELLED'],
  CANCELLED: [],
  REFUNDED: [],
};

export class OrderService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly notifications?: NotificationService,
    private readonly stock?: StockService,
  ) {}

  async list(ctx: TenantContext, storeId?: string) {
    return this.prisma.order.findMany({
      where: { tenantId: ctx.tenantId, ...(storeId ? { storeId } : {}) },
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(ctx: TenantContext, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: orderInclude,
    });
    if (!order) throw new NotFoundError('Order', id);
    return order;
  }

  async updateStatus(ctx: TenantContext, id: string, status: OrderStatus) {
    const before = await this.get(ctx, id);
    // Enforce a state machine so illegal moves (e.g. PAID→PENDING, REFUNDED→PAID)
    // are rejected; a same-status call is a no-op.
    if (status !== before.status && !ORDER_TRANSITIONS[before.status].includes(status)) {
      throw new ValidationError(`Cannot move an order from ${before.status} to ${status}.`);
    }
    const order = await this.prisma.order.update({
      where: { id },
      data: { status },
      include: orderInclude,
    });
    // Reversing an order returns its stock: a paid order had inventory consumed
    // (restore it), an unpaid one only held a reservation (release it).
    const reversing = status === 'CANCELLED' || status === 'REFUNDED';
    const wasPaid = before.status === 'PAID' || before.status === 'FULFILLED';
    if (reversing && before.status !== status) {
      if (wasPaid) await this.stock?.restoreOrder(id).catch(() => undefined);
      else if (before.status === 'PENDING') await this.stock?.releaseReservations(id).catch(() => undefined);
    }
    // Best-effort customer notification; never block the status change.
    await this.notifications
      ?.notifyOrderEvent(ctx, id, 'ORDER_STATUS_CHANGED')
      .catch(() => undefined);
    return order;
  }
}
