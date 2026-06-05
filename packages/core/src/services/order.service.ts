import type { OrderStatus, PrismaClient } from '@prisma/client';
import { NotFoundError, type TenantContext } from '../context.js';

const orderInclude = { items: true, payment: true, customer: true } as const;

export class OrderService {
  constructor(private readonly prisma: PrismaClient) {}

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
    await this.get(ctx, id);
    return this.prisma.order.update({
      where: { id },
      data: { status },
      include: orderInclude,
    });
  }
}
