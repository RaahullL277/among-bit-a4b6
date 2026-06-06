import type { PrismaClient } from '@prisma/client';
import { NotFoundError, type TenantContext } from '../context.js';
import type { MarketingService } from './marketing.service.js';

export interface CreateCustomerInput {
  storeId: string;
  name?: string;
  email?: string;
  phone?: string;
}

export class CustomerService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly marketing?: MarketingService,
  ) {}

  private async assertStore(ctx: TenantContext, storeId: string) {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!store) throw new NotFoundError('Store', storeId);
  }

  async create(ctx: TenantContext, input: CreateCustomerInput) {
    await this.assertStore(ctx, input.storeId);
    const customer = await this.prisma.customer.create({
      data: {
        tenantId: ctx.tenantId,
        storeId: input.storeId,
        name: input.name,
        email: input.email,
        phone: input.phone,
      },
    });
    // Best-effort sync to marketing platforms (Klaviyo/Mailchimp/Brevo).
    await this.marketing?.syncCustomer(ctx, customer.id).catch(() => undefined);
    return customer;
  }

  async list(ctx: TenantContext, storeId: string) {
    await this.assertStore(ctx, storeId);
    return this.prisma.customer.findMany({
      where: { tenantId: ctx.tenantId, storeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(ctx: TenantContext, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!customer) throw new NotFoundError('Customer', id);
    return customer;
  }
}
