import type { OAuthProvider, PlatformRole, PlatformUser, PrismaClient } from '@prisma/client';
import { AuthError, ValidationError } from '../context.js';
import { generateToken, generateTotpSecret, hashToken, openSecret, otpauthUrl, sealSecret, verifyTotp } from '../crypto.js';
import { platformPermissionsForRole, type PlatformContext } from '../platform/authz.js';
import { HttpOAuthVerifier, type OAuthVerifier } from '../auth/oauth.js';

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h — operator sessions are short-lived
const TWO_FA_TTL_MS = 10 * 60 * 1000;
const TWO_FA_ISSUER = process.env.TWO_FA_ISSUER ?? 'ACP Platform';

export interface PlatformSessionResult {
  token: string;
  role: PlatformRole;
  user: { id: string; email: string; name: string | null };
}

/** Returned instead of a session when the operator account has 2FA enabled. */
export interface PlatformTwoFactorPending {
  twoFactorRequired: true;
  challengeToken: string;
}

export type PlatformLoginOutcome = PlatformSessionResult | PlatformTwoFactorPending;

/**
 * Authentication for platform-operator staff. Mirrors the merchant magic-link
 * flow but on a separate identity plane (PlatformUser) — there is no signup;
 * staff are provisioned by a SUPER_ADMIN (or the seed). Supports Google/Apple
 * OAuth (sign-in for existing staff only) and TOTP two-factor.
 */
export class PlatformAuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly oauth: OAuthVerifier = new HttpOAuthVerifier(),
  ) {}

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

  async verifyMagicLink(rawToken: string): Promise<PlatformLoginOutcome> {
    const token = await this.prisma.platformMagicLinkToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
    if (!token || token.consumedAt || token.expiresAt < new Date()) {
      throw new AuthError('Invalid or expired login link.');
    }
    await this.prisma.platformMagicLinkToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } });
    const user = await this.prisma.platformUser.findUnique({ where: { email: token.email } });
    if (!user) throw new AuthError('No platform account for this email.');
    return this.completeLogin(user);
  }

  private async issueSession(user: PlatformUser): Promise<PlatformSessionResult> {
    const { raw, hash } = generateToken('psa');
    await this.prisma.platformSession.create({
      data: { platformUserId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
    });
    return { token: raw, role: user.role, user: { id: user.id, email: user.email, name: user.name } };
  }

  /** Finish login: a 2FA challenge when enabled, otherwise a session. */
  private async completeLogin(user: PlatformUser): Promise<PlatformLoginOutcome> {
    if (user.twoFactorEnabledAt) {
      const { raw, hash } = generateToken('p2fc');
      await this.prisma.platformTwoFactorChallenge.create({
        data: { platformUserId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + TWO_FA_TTL_MS) },
      });
      return { twoFactorRequired: true, challengeToken: raw };
    }
    return this.issueSession(user);
  }

  // --- Google / Apple OAuth (sign-in for existing staff only) ---------------

  async oauthLogin(input: { provider: OAuthProvider; idToken: string }): Promise<PlatformLoginOutcome> {
    const profile = await this.oauth.verify(input.provider, input.idToken).catch((e) => {
      throw new AuthError(`Sign-in with ${input.provider} failed: ${(e as Error).message}`);
    });
    const link = await this.prisma.platformOAuthIdentity.findUnique({
      where: { provider_providerUserId: { provider: input.provider, providerUserId: profile.providerUserId } },
      include: { user: true },
    });
    if (link) return this.completeLogin(link.user);

    // Operators are never auto-created: only link to an existing account by email.
    if (!profile.email) throw new AuthError('No platform account for this sign-in.');
    const user = await this.prisma.platformUser.findUnique({ where: { email: this.normalizeEmail(profile.email) } });
    if (!user) throw new AuthError('No platform account for this email.');
    await this.prisma.platformOAuthIdentity.create({
      data: { platformUserId: user.id, provider: input.provider, providerUserId: profile.providerUserId, email: this.normalizeEmail(profile.email) },
    });
    return this.completeLogin(user);
  }

  // --- Two-factor (TOTP) ----------------------------------------------------

  async setupTwoFactor(ctx: PlatformContext): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.prisma.platformUser.findUnique({ where: { id: ctx.platformUserId } });
    if (!user) throw new AuthError();
    const secret = generateTotpSecret();
    await this.prisma.platformUser.update({ where: { id: user.id }, data: { twoFactorSecret: sealSecret(secret) } });
    return { secret, otpauthUrl: otpauthUrl(secret, user.email, TWO_FA_ISSUER) };
  }

  async enableTwoFactor(ctx: PlatformContext, code: string): Promise<{ enabled: true }> {
    const user = await this.prisma.platformUser.findUnique({ where: { id: ctx.platformUserId } });
    const secret = openSecret(user?.twoFactorSecret ?? null);
    if (!secret) throw new ValidationError('Start 2FA setup first.');
    if (!verifyTotp(secret, code)) throw new AuthError('That code is not valid. Try again.');
    await this.prisma.platformUser.update({ where: { id: ctx.platformUserId }, data: { twoFactorEnabledAt: new Date() } });
    return { enabled: true };
  }

  async disableTwoFactor(ctx: PlatformContext, code: string): Promise<{ enabled: false }> {
    const user = await this.prisma.platformUser.findUnique({ where: { id: ctx.platformUserId } });
    const secret = openSecret(user?.twoFactorSecret ?? null);
    if (!user?.twoFactorEnabledAt || !secret) return { enabled: false };
    if (!verifyTotp(secret, code)) throw new AuthError('That code is not valid.');
    await this.prisma.platformUser.update({ where: { id: user.id }, data: { twoFactorEnabledAt: null, twoFactorSecret: null } });
    return { enabled: false };
  }

  async verifyTwoFactor(challengeToken: string, code: string): Promise<PlatformSessionResult> {
    const challenge = await this.prisma.platformTwoFactorChallenge.findUnique({ where: { tokenHash: hashToken(challengeToken) } });
    if (!challenge || challenge.consumedAt || challenge.expiresAt < new Date()) {
      throw new AuthError('This 2FA challenge has expired. Please sign in again.');
    }
    const user = await this.prisma.platformUser.findUnique({ where: { id: challenge.platformUserId } });
    const secret = openSecret(user?.twoFactorSecret ?? null);
    if (!user || !secret) throw new AuthError();
    if (!verifyTotp(secret, code)) throw new AuthError('That code is not valid. Try again.');
    await this.prisma.platformTwoFactorChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
    return this.issueSession(user);
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

  async me(ctx: PlatformContext) {
    const user = await this.prisma.platformUser.findUnique({
      where: { id: ctx.platformUserId },
      include: { oauthIdentities: { select: { provider: true } } },
    });
    return {
      email: ctx.actorEmail,
      role: ctx.role,
      permissions: ctx.permissions,
      auth: {
        twoFactorEnabled: Boolean(user?.twoFactorEnabledAt),
        oauthProviders: user?.oauthIdentities.map((o) => o.provider) ?? [],
      },
    };
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
