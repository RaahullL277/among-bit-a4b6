import type { PlatformRole, PlatformUser, PrismaClient } from '@prisma/client';
import { AuthError, ValidationError } from '../context.js';
import { generateToken, hashToken } from '../crypto.js';
import { platformPermissionsForRole, type PlatformContext } from '../platform/authz.js';

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h — operator sessions are short-lived

export interface PlatformSessionResult {
  token: string;
  role: PlatformRole;
  user: { id: string; email: string; name: string | null };
}

/**
 * Authentication for platform-operator staff. Mirrors the merchant magic-link
 * flow but on a separate identity plane (PlatformUser) — there is no signup;
 * staff are provisioned by a SUPER_ADMIN (or the seed).
 */
export class PlatformAuthService {
  constructor(private readonly prisma: PrismaClient) {}

  private normalizeEmail(email: string): string {
    const e = email?.trim().toLowerCase();
    if (!e || !e.includes('@')) throw new ValidationError('A valid email is required.');
    return e;
  }

  async requestMagicLink(email: string): Promise<{ token: string | null }> {
    const normalized = this.normalizeEmail(email);
    const user = await this.prisma.platformUser.findUnique({ where: { email: normalized } });
    // Don't reveal whether the email is a known staff account.
    if (!user) return { token: null };
    const { raw, hash } = generateToken('pml');
    await this.prisma.platformMagicLinkToken.create({
      data: { email: normalized, tokenHash: hash, expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS) },
    });
    return { token: raw };
  }

  async verifyMagicLink(rawToken: string): Promise<PlatformSessionResult> {
    const token = await this.prisma.platformMagicLinkToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
    if (!token || token.consumedAt || token.expiresAt < new Date()) {
      throw new AuthError('Invalid or expired login link.');
    }
    await this.prisma.platformMagicLinkToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } });
    const user = await this.prisma.platformUser.findUnique({ where: { email: token.email } });
    if (!user) throw new AuthError('No platform account for this email.');
    return this.issueSession(user);
  }

  private async issueSession(user: PlatformUser): Promise<PlatformSessionResult> {
    const { raw, hash } = generateToken('psa');
    await this.prisma.platformSession.create({
      data: { platformUserId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
    });
    return { token: raw, role: user.role, user: { id: user.id, email: user.email, name: user.name } };
  }

  async resolveSession(rawToken: string): Promise<PlatformContext> {
    const session = await this.prisma.platformSession.findUnique({ where: { tokenHash: hashToken(rawToken) } });
    if (!session || session.expiresAt < new Date()) throw new AuthError('Platform session expired.');
    const user = await this.prisma.platformUser.findUnique({ where: { id: session.platformUserId } });
    if (!user) throw new AuthError();

    void this.prisma.platformSession
      .update({ where: { id: session.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    return {
      platformUserId: user.id,
      actorEmail: user.email,
      role: user.role,
      permissions: platformPermissionsForRole(user.role),
    };
  }

  async logout(rawToken: string): Promise<void> {
    await this.prisma.platformSession.deleteMany({ where: { tokenHash: hashToken(rawToken) } });
  }

  me(ctx: PlatformContext) {
    return { email: ctx.actorEmail, role: ctx.role, permissions: ctx.permissions };
  }

  // --- Staff management (requires platform:staff:manage at the transport) ----

  async listStaff() {
    return this.prisma.platformUser.findMany({
      select: { id: true, email: true, name: true, role: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createStaff(input: { email: string; name?: string; role: PlatformRole }) {
    const email = this.normalizeEmail(input.email);
    const existing = await this.prisma.platformUser.findUnique({ where: { email } });
    if (existing) throw new ValidationError('A platform user with this email already exists.');
    return this.prisma.platformUser.create({ data: { email, name: input.name, role: input.role } });
  }

  async changeStaffRole(id: string, role: PlatformRole) {
    const user = await this.prisma.platformUser.findUnique({ where: { id } });
    if (!user) throw new ValidationError('Platform user not found.');
    if (user.role === 'SUPER_ADMIN' && role !== 'SUPER_ADMIN') await this.assertNotLastSuperAdmin(id);
    return this.prisma.platformUser.update({ where: { id }, data: { role } });
  }

  async removeStaff(id: string) {
    const user = await this.prisma.platformUser.findUnique({ where: { id } });
    if (!user) throw new ValidationError('Platform user not found.');
    if (user.role === 'SUPER_ADMIN') await this.assertNotLastSuperAdmin(id);
    await this.prisma.platformUser.delete({ where: { id } });
    return { removed: true };
  }

  private async assertNotLastSuperAdmin(excludingId: string) {
    const others = await this.prisma.platformUser.count({
      where: { role: 'SUPER_ADMIN', id: { not: excludingId } },
    });
    if (others === 0) throw new ValidationError('There must be at least one platform super admin.');
  }
}
