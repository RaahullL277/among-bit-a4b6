import type { OrderStatus, PrismaClient } from '@prisma/client';
import { NotFoundError, type TenantContext } from '../context.js';
import type { NotificationService } from './notification.service.js';
import type { StockService } from './stock.service.js';

const orderInclude = { items: true, payment: true, customer: true } as const;

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
