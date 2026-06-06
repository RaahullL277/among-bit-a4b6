import type { PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError } from '../context.js';

const PAID = ['PAID', 'FULFILLED'] as const;
const DAY_MS = 86_400_000;

export interface CreatePartnerInput {
  name: string;
  email: string;
  commissionPercent?: number;
}

export interface AddClientInput {
  tenantId: string;
  monthlyFeeMinor?: number;
  renewsAt?: string | Date;
}

/**
 * Partner / agency program. Two surfaces:
 *  - operator management (create partners, link client tenants, set fees) — the
 *    transport gates these with a platform permission;
 *  - the partner dashboard (analytics across a partner's own clients, earnings
 *    from commission on client GMV, and upcoming renewals), scoped by partnerId.
 */
export class PartnerService {
  constructor(private readonly prisma: PrismaClient) {}

  // --- Operator management --------------------------------------------------

  async createPartner(input: CreatePartnerInput) {
    const email = input.email?.trim().toLowerCase();
    if (!email || !email.includes('@')) throw new ValidationError('A valid email is required.');
    if (!input.name?.trim()) throw new ValidationError('A partner name is required.');
    const commission = Math.round(input.commissionPercent ?? 10);
    if (commission < 0 || commission > 100) throw new ValidationError('Commission must be between 0 and 100.');
    const existing = await this.prisma.partner.findUnique({ where: { email } });
    if (existing) throw new ValidationError('A partner with this email already exists.');
    return this.prisma.partner.create({ data: { name: input.name.trim(), email, commissionPercent: commission } });
  }

  async listPartners() {
    const partners = await this.prisma.partner.findMany({
      include: { _count: { select: { clients: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return partners.map((p) => ({ id: p.id, name: p.name, email: p.email, commissionPercent: p.commissionPercent, clients: p._count.clients }));
  }

  async addClient(partnerId: string, input: AddClientInput) {
    const partner = await this.prisma.partner.findUnique({ where: { id: partnerId }, select: { id: true } });
    if (!partner) throw new NotFoundError('Partner', partnerId);
    const tenant = await this.prisma.tenant.findUnique({ where: { id: input.tenantId }, select: { id: true } });
    if (!tenant) throw new NotFoundError('Tenant', input.tenantId);
    const taken = await this.prisma.partnerClient.findUnique({ where: { tenantId: input.tenantId }, select: { id: true } });
    if (taken) throw new ValidationError('This client is already assigned to a partner.');
    return this.prisma.partnerClient.create({
      data: {
        partnerId,
        tenantId: input.tenantId,
        monthlyFeeMinor: Math.max(0, Math.round(input.monthlyFeeMinor ?? 0)),
        renewsAt: input.renewsAt ? new Date(input.renewsAt) : null,
      },
    });
  }

  async updateClient(partnerId: string, clientId: string, patch: { monthlyFeeMinor?: number; renewsAt?: string | Date | null }) {
    const client = await this.prisma.partnerClient.findFirst({ where: { id: clientId, partnerId }, select: { id: true } });
    if (!client) throw new NotFoundError('PartnerClient', clientId);
    return this.prisma.partnerClient.update({
      where: { id: clientId },
      data: {
        ...(patch.monthlyFeeMinor !== undefined ? { monthlyFeeMinor: Math.max(0, Math.round(patch.monthlyFeeMinor)) } : {}),
        ...(patch.renewsAt !== undefined ? { renewsAt: patch.renewsAt ? new Date(patch.renewsAt) : null } : {}),
      },
    });
  }

  async removeClient(partnerId: string, clientId: string) {
    const client = await this.prisma.partnerClient.findFirst({ where: { id: clientId, partnerId }, select: { id: true } });
    if (!client) throw new NotFoundError('PartnerClient', clientId);
    await this.prisma.partnerClient.delete({ where: { id: clientId } });
    return { id: clientId, removed: true };
  }

  // --- Partner-facing analytics ---------------------------------------------

  private range(from?: string | Date) {
    const to = new Date();
    const start = from ? new Date(from) : new Date(to.getTime() - 30 * DAY_MS);
    return { from: start, to };
  }

  /** Per-client GMV/orders over a window, keyed by tenantId. */
  private async gmvByTenant(tenantIds: string[], from: Date, to: Date) {
    if (!tenantIds.length) return new Map<string, { gmvMinor: number; orders: number }>();
    const grouped = await this.prisma.order.groupBy({
      by: ['tenantId'],
      where: { tenantId: { in: tenantIds }, status: { in: [...PAID] }, createdAt: { gte: from, lte: to } },
      _sum: { totalMinor: true },
      _count: true,
    });
    return new Map(grouped.map((g) => [g.tenantId, { gmvMinor: g._sum.totalMinor ?? 0, orders: g._count }]));
  }

  private async loadClients(partnerId: string) {
    const partner = await this.prisma.partner.findUnique({
      where: { id: partnerId },
      include: {
        clients: {
          include: { tenant: { select: { id: true, name: true, status: true, _count: { select: { stores: true } } } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!partner) throw new NotFoundError('Partner', partnerId);
    return partner;
  }

  async clients(partnerId: string, from?: string | Date) {
    const partner = await this.loadClients(partnerId);
    const { from: start, to } = this.range(from);
    const gmv = await this.gmvByTenant(partner.clients.map((c) => c.tenantId), start, to);
    return partner.clients.map((c) => {
      const g = gmv.get(c.tenantId) ?? { gmvMinor: 0, orders: 0 };
      return {
        clientId: c.id,
        tenantId: c.tenantId,
        name: c.tenant.name,
        status: c.tenant.status,
        stores: c.tenant._count.stores,
        gmvMinor: g.gmvMinor,
        orders: g.orders,
        earningsMinor: Math.floor((g.gmvMinor * partner.commissionPercent) / 100),
        monthlyFeeMinor: c.monthlyFeeMinor,
        renewsAt: c.renewsAt,
      };
    });
  }

  /** Headline KPIs + per-client breakdown for the partner dashboard. */
  async dashboard(partnerId: string, from?: string | Date) {
    const partner = await this.loadClients(partnerId);
    const { from: start, to } = this.range(from);
    const clients = await this.clients(partnerId, start);

    const gmvMinor = clients.reduce((s, c) => s + c.gmvMinor, 0);
    const orders = clients.reduce((s, c) => s + c.orders, 0);
    const earningsMinor = clients.reduce((s, c) => s + c.earningsMinor, 0);
    const mrrMinor = partner.clients.reduce((s, c) => s + (c.tenant.status === 'ACTIVE' ? c.monthlyFeeMinor : 0), 0);
    const activeClients = partner.clients.filter((c) => c.tenant.status === 'ACTIVE').length;
    const stores = clients.reduce((s, c) => s + c.stores, 0);

    return {
      partner: { id: partner.id, name: partner.name, email: partner.email, commissionPercent: partner.commissionPercent },
      from: start,
      to,
      clientCount: partner.clients.length,
      activeClients,
      stores,
      gmvMinor,
      orders,
      earningsMinor,
      mrrMinor,
      upcomingRenewals: await this.renewals(partnerId, 30),
      topClients: [...clients].sort((a, b) => b.gmvMinor - a.gmvMinor).slice(0, 5),
    };
  }

  /** Clients whose plan renews within `withinDays`, soonest first. */
  async renewals(partnerId: string, withinDays = 30) {
    const now = new Date();
    const until = new Date(now.getTime() + withinDays * DAY_MS);
    const rows = await this.prisma.partnerClient.findMany({
      where: { partnerId, renewsAt: { not: null, lte: until } },
      include: { tenant: { select: { name: true, status: true } } },
      orderBy: { renewsAt: 'asc' },
    });
    return rows.map((r) => ({
      clientId: r.id,
      tenantId: r.tenantId,
      name: r.tenant.name,
      status: r.tenant.status,
      monthlyFeeMinor: r.monthlyFeeMinor,
      renewsAt: r.renewsAt,
      overdue: r.renewsAt ? r.renewsAt < now : false,
    }));
  }
}
