import type { PrismaClient, Role, User } from '@prisma/client';
import { AuthError, ValidationError, type TenantContext } from '../context.js';
import { generateToken, hashToken } from '../crypto.js';
import { permissionsForRole } from '../authz.js';

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000; // 15 minutes
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface IssuedSession {
  token: string;
  tenantId: string;
  role: Role;
  user: { id: string; email: string; name: string | null };
}

/**
 * Passwordless authentication: magic-link login, invite acceptance, signup,
 * and session issuance/resolution. These operate across tenants (pre-auth), so
 * unlike the commerce services they are not bound to a TenantContext.
 */
export class AuthService {
  constructor(private readonly prisma: PrismaClient) {}

  private normalizeEmail(email: string): string {
    const e = email?.trim().toLowerCase();
    if (!e || !e.includes('@')) throw new ValidationError('A valid email is required.');
    return e;
  }

  // --- Magic-link login -----------------------------------------------------

  /** Create a single-use login token. The raw token is emailed as a link. */
  async requestMagicLink(email: string): Promise<{ token: string; expiresAt: Date }> {
    const normalized = this.normalizeEmail(email);
    const { raw, hash } = generateToken('ml');
    const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS);
    await this.prisma.magicLinkToken.create({ data: { email: normalized, tokenHash: hash, expiresAt } });
    return { token: raw, expiresAt };
  }

  /**
   * Consume a magic link and sign the user in. Issues a session for the user's
   * (single) tenant; if they belong to several, the first membership is used.
   */
  async verifyMagicLink(rawToken: string): Promise<IssuedSession> {
    const token = await this.prisma.magicLinkToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
    if (!token || token.consumedAt || token.expiresAt < new Date()) {
      throw new AuthError('Invalid or expired login link.');
    }
    await this.prisma.magicLinkToken.update({
      where: { id: token.id },
      data: { consumedAt: new Date() },
    });

    const user = await this.prisma.user.findUnique({ where: { email: token.email } });
    if (!user) throw new AuthError('No account found for this email. Ask an admin to invite you.');

    const membership = await this.prisma.membership.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
    });
    if (!membership) throw new AuthError('Your account is not a member of any workspace.');

    return this.issueSession(user, membership.tenantId, membership.role);
  }

  // --- Signup (bootstraps a tenant + its first owner) -----------------------

  async signup(input: { email: string; name?: string; tenantName: string }): Promise<IssuedSession> {
    const email = this.normalizeEmail(input.email);
    if (!input.tenantName?.trim()) throw new ValidationError('A workspace name is required.');

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ValidationError('An account with this email already exists. Sign in instead.');
    }

    const tenant = await this.prisma.tenant.create({ data: { name: input.tenantName.trim() } });
    const user = await this.prisma.user.create({ data: { email, name: input.name } });
    await this.prisma.membership.create({
      data: { userId: user.id, tenantId: tenant.id, role: 'OWNER' },
    });
    return this.issueSession(user, tenant.id, 'OWNER');
  }

  // --- Invite acceptance ----------------------------------------------------

  async acceptInvite(rawToken: string, name?: string): Promise<IssuedSession> {
    const invite = await this.prisma.invite.findUnique({ where: { tokenHash: hashToken(rawToken) } });
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      throw new AuthError('Invalid or expired invitation.');
    }

    const user = await this.prisma.user.upsert({
      where: { email: invite.email },
      create: { email: invite.email, name },
      update: name ? { name } : {},
    });
    await this.prisma.membership.upsert({
      where: { userId_tenantId: { userId: user.id, tenantId: invite.tenantId } },
      create: { userId: user.id, tenantId: invite.tenantId, role: invite.role },
      update: { role: invite.role },
    });
    await this.prisma.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });

    return this.issueSession(user, invite.tenantId, invite.role);
  }

  // --- Sessions -------------------------------------------------------------

  private async issueSession(user: User, tenantId: string, role: Role): Promise<IssuedSession> {
    const { raw, hash } = generateToken('ses');
    await this.prisma.session.create({
      data: { userId: user.id, tenantId, tokenHash: hash, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
    });
    return { token: raw, tenantId, role, user: { id: user.id, email: user.email, name: user.name } };
  }

  /** Resolve a session token into a TenantContext with a user actor. */
  async resolveSession(rawToken: string): Promise<TenantContext> {
    const session = await this.prisma.session.findUnique({ where: { tokenHash: hashToken(rawToken) } });
    if (!session || session.expiresAt < new Date()) throw new AuthError('Session expired. Please sign in again.');

    const membership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId: session.userId, tenantId: session.tenantId } },
    });
    if (!membership) throw new AuthError('Your access to this workspace was removed.');

    void this.prisma.session
      .update({ where: { id: session.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    return {
      tenantId: session.tenantId,
      actor: {
        kind: 'user',
        userId: session.userId,
        role: membership.role,
        permissions: permissionsForRole(membership.role),
      },
    };
  }

  async logout(rawToken: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { tokenHash: hashToken(rawToken) } });
  }

  /** Current user + their memberships, for the /auth/me endpoint. */
  async me(ctx: TenantContext) {
    const permissions = ctx.actor?.permissions ?? [];
    if (ctx.actor?.kind !== 'user') {
      return { actor: 'apiKey' as const, tenantId: ctx.tenantId, role: 'OWNER' as Role, permissions };
    }
    const user = await this.prisma.user.findUnique({
      where: { id: ctx.actor.userId },
      include: { memberships: { include: { tenant: true } } },
    });
    if (!user) throw new AuthError();
    return {
      actor: 'user' as const,
      id: user.id,
      email: user.email,
      name: user.name,
      tenantId: ctx.tenantId,
      role: ctx.actor.role,
      permissions,
      memberships: user.memberships.map((m) => ({
        tenantId: m.tenantId,
        tenantName: m.tenant.name,
        role: m.role,
      })),
    };
  }
}
