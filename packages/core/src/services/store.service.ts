import type { PrismaClient, Store } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';

export interface CreateStoreInput {
  name: string;
  slug?: string;
  domain?: string;
  currency?: string;
  country?: string;
  ownerEmail?: string;
  ownerPhone?: string;
}

export interface UpdateStoreInput {
  name?: string;
  domain?: string;
  status?: 'ACTIVE' | 'SUSPENDED';
  ownerEmail?: string;
  ownerPhone?: string;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export class StoreService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(ctx: TenantContext, input: CreateStoreInput): Promise<Store> {
    const slug = slugify(input.slug ?? input.name);
    if (!slug) throw new ValidationError('A store name or slug is required.');

    const existing = await this.prisma.store.findUnique({
      where: { tenantId_slug: { tenantId: ctx.tenantId, slug } },
    });
    if (existing) throw new ValidationError(`A store with slug "${slug}" already exists.`);

    return this.prisma.store.create({
      data: {
        tenantId: ctx.tenantId,
        name: input.name,
        slug,
        domain: input.domain,
        currency: input.currency ?? 'INR',
        country: input.country ?? 'IN',
        ownerEmail: input.ownerEmail,
        ownerPhone: input.ownerPhone,
      },
    });
  }

  async list(ctx: TenantContext): Promise<Store[]> {
    return this.prisma.store.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(ctx: TenantContext, id: string): Promise<Store> {
    const store = await this.prisma.store.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!store) throw new NotFoundError('Store', id);
    return store;
  }

  async update(ctx: TenantContext, id: string, input: UpdateStoreInput): Promise<Store> {
    await this.get(ctx, id); // tenant-scoped existence check
    return this.prisma.store.update({
      where: { id },
      data: {
        name: input.name,
        domain: input.domain,
        status: input.status,
        ownerEmail: input.ownerEmail,
        ownerPhone: input.ownerPhone,
      },
    });
  }
}
