import type { PrismaClient, Role } from '@prisma/client';
import { ForbiddenError, NotFoundError, ValidationError, type TenantContext } from '../context.js';
import { generateToken } from '../crypto.js';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Role hierarchy: a caller may never grant or touch a role above their own.
const RANK: Record<Role, number> = { OWNER: 3, ADMIN: 2, STAFF: 1 };

/**
 * Tenant-scoped team management: members, roles, and invitations. Permission
 * enforcement (members:manage) happens at the transport layer; these methods
 * still guard the critical invariant that a tenant keeps at least one OWNER.
 */
export class MemberService {
  constructor(private readonly prisma: PrismaClient) {}

  async listMembers(ctx: TenantContext) {
    const rows = await this.prisma.membership.findMany({
      where: { tenantId: ctx.tenantId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((m) => ({
      userId: m.userId,
      email: m.user.email,
      name: m.user.name,
      role: m.role,
      joinedAt: m.createdAt,
    }));
  }

  async listInvites(ctx: TenantContext) {
    return this.prisma.invite.findMany({
      where: { tenantId: ctx.tenantId, acceptedAt: null },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Create an invite; returns the raw token so the caller can email a link. */
  /** The rank of the actor making the request (API key / partner = OWNER-level). */
  private callerRank(ctx: TenantContext): number {
    return ctx.actor?.kind === 'user' ? RANK[ctx.actor.role] : RANK.OWNER;
  }

  async createInvite(ctx: TenantContext, input: { email: string; role: Role }) {
    const email = input.email?.trim().toLowerCase();
    if (!email || !email.includes('@')) throw new ValidationError('A valid email is required.');
    // Prevent privilege escalation: you cannot invite a role above your own.
    if (RANK[input.role] > this.callerRank(ctx)) {
      throw new ForbiddenError('You cannot invite a member with a higher role than your own.');
    }

    // If already a member, this is a no-op error rather than a silent dup.
    const existing = await this.prisma.membership.findFirst({
      where: { tenantId: ctx.tenantId, user: { email } },
    });
    if (existing) throw new ValidationError('That email is already a member of this workspace.');

    const { raw, hash } = generateToken('inv');
    const invite = await this.prisma.invite.create({
      data: {
        tenantId: ctx.tenantId,
        email,
        role: input.role,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });
    return { invite: { id: invite.id, email: invite.email, role: invite.role, expiresAt: invite.expiresAt }, token: raw };
  }

  async revokeInvite(ctx: TenantContext, id: string) {
    await this.prisma.invite.deleteMany({ where: { id, tenantId: ctx.tenantId } });
    return { revoked: true };
  }

  async changeRole(ctx: TenantContext, userId: string, role: Role) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId: ctx.tenantId } },
    });
    if (!membership) throw new NotFoundError('Member', userId);

    // No privilege escalation: you cannot assign a role above your own, nor
    // modify a member who already outranks you.
    const rank = this.callerRank(ctx);
    if (RANK[role] > rank || RANK[membership.role] > rank) {
      throw new ForbiddenError('You cannot grant or change a role higher than your own.');
    }
    if (membership.role === 'OWNER' && role !== 'OWNER') {
      await this.assertNotLastOwner(ctx.tenantId, userId);
    }
    return this.prisma.membership.update({
      where: { userId_tenantId: { userId, tenantId: ctx.tenantId } },
      data: { role },
    });
  }

  async removeMember(ctx: TenantContext, userId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId: ctx.tenantId } },
    });
    if (!membership) throw new NotFoundError('Member', userId);
    if (membership.role === 'OWNER') await this.assertNotLastOwner(ctx.tenantId, userId);

    await this.prisma.membership.delete({
      where: { userId_tenantId: { userId, tenantId: ctx.tenantId } },
    });
    return { removed: true };
  }

  private async assertNotLastOwner(tenantId: string, excludingUserId: string) {
    const otherOwners = await this.prisma.membership.count({
      where: { tenantId, role: 'OWNER', userId: { not: excludingUserId } },
    });
    if (otherOwners === 0) {
      throw new ValidationError('A workspace must keep at least one owner.');
    }
  }
}
