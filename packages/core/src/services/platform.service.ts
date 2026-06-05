import type { Prisma, PrismaClient } from '@prisma/client';
import { NotFoundError } from '../context.js';
import type { PlatformContext } from '../platform/authz.js';

/**
 * Cross-tenant operator back-office: tenant/store directory and suspension.
 * Not tenant-scoped — these methods read and act across every merchant, so the
 * transport layer must enforce platform permissions before calling them. Every
 * mutating action is recorded in the platform audit log.
 */
export class PlatformService {
  constructor(private readonly prisma: PrismaClient) {}

  async listTenants(opts: { search?: string; status?: 'ACTIVE' | 'SUSPENDED' } = {}) {
    const where: Prisma.TenantWhereInput = {
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.search ? { name: { contains: opts.search, mode: 'insensitive' } } : {}),
    };
    const tenants = await this.prisma.tenant.findMany({
      where,
      include: { _count: { select: { stores: true, memberships: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return tenants.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      createdAt: t.createdAt,
      stores: t._count.stores,
      members: t._count.memberships,
    }));
  }

  async getTenant(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        stores: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            createdAt: true,
            _count: { select: { products: true, orders: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { memberships: true } },
      },
    });
    if (!tenant) throw new NotFoundError('Tenant', id);
    return {
      id: tenant.id,
      name: tenant.name,
      status: tenant.status,
      createdAt: tenant.createdAt,
      members: tenant._count.memberships,
      stores: tenant.stores.map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        status: s.status,
        createdAt: s.createdAt,
        products: s._count.products,
        orders: s._count.orders,
      })),
    };
  }

  // --- Suspension -----------------------------------------------------------

  async setTenantStatus(ctx: PlatformContext, tenantId: string, status: 'ACTIVE' | 'SUSPENDED') {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundError('Tenant', tenantId);
    const updated = await this.prisma.tenant.update({ where: { id: tenantId }, data: { status } });
    await this.audit(ctx, status === 'SUSPENDED' ? 'tenant.suspend' : 'tenant.reactivate', 'tenant', tenantId, {
      name: tenant.name,
    });
    return { id: updated.id, status: updated.status };
  }

  async setStoreStatus(ctx: PlatformContext, storeId: string, status: 'ACTIVE' | 'SUSPENDED') {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new NotFoundError('Store', storeId);
    const updated = await this.prisma.store.update({ where: { id: storeId }, data: { status } });
    await this.audit(ctx, status === 'SUSPENDED' ? 'store.suspend' : 'store.reactivate', 'store', storeId, {
      name: store.name,
      tenantId: store.tenantId,
    });
    return { id: updated.id, status: updated.status };
  }

  // --- Audit ----------------------------------------------------------------

  async audit(
    ctx: PlatformContext,
    action: string,
    targetType?: string,
    targetId?: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.prisma.platformAuditLog.create({
      data: {
        platformUserId: ctx.platformUserId,
        actorEmail: ctx.actorEmail,
        action,
        targetType,
        targetId,
        metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async listAudit(opts: { limit?: number } = {}) {
    return this.prisma.platformAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: opts.limit ?? 100,
    });
  }
}
