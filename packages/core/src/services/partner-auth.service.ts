import type { OAuthProvider, Partner, PrismaClient } from '@prisma/client';
import { AuthError, ValidationError } from '../context.js';
import { generateToken, generateTotpSecret, hashToken, openSecret, otpauthUrl, sealSecret, verifyTotp } from '../crypto.js';
import { HttpOAuthVerifier, type OAuthVerifier } from '../auth/oauth.js';

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const TWO_FA_TTL_MS = 10 * 60 * 1000;
const TWO_FA_ISSUER = process.env.TWO_FA_ISSUER ?? 'ACP Partners';

/** Identity of an authenticated partner (separate plane from merchants/operators). */
export interface PartnerContext {
  partnerId: string;
  email: string;
  name: string;
}

export interface PartnerSessionResult {
  token: string;
  partner: { id: string; email: string; name: string };
}

/** Returned instead of a session when the partner account has 2FA enabled. */
export interface PartnerTwoFactorPending {
  twoFactorRequired: true;
  challengeToken: string;
}

export type PartnerLoginOutcome = PartnerSessionResult | PartnerTwoFactorPending;

/**
 * Authentication for partners/agencies. Mirrors the platform magic-link flow on
 * its own identity plane (Partner). Partners are provisioned by a platform
 * operator (or the seed); there is no self-signup. Supports Google/Apple OAuth
 * (sign-in for existing partners only) and TOTP two-factor.
 */
export class PartnerAuthService {
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
    const partner = await this.prisma.partner.findUnique({ where: { email: normalized } });
    if (!partner) return { token: null }; // don't reveal known accounts
    const { raw, hash } = generateToken('ptml');
    await this.prisma.partnerMagicLinkToken.create({
      data: { email: normalized, tokenHash: hash, expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS) },
    });
    return { token: raw };
  }

  async verifyMagicLink(rawToken: string): Promise<PartnerLoginOutcome> {
    const token = await this.prisma.partnerMagicLinkToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
    if (!token || token.consumedAt || token.expiresAt < new Date()) {
      throw new AuthError('Invalid or expired login link.');
    }
    await this.prisma.partnerMagicLinkToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } });
    const partner = await this.prisma.partner.findUnique({ where: { email: token.email } });
    if (!partner) throw new AuthError('No partner account for this email.');
    return this.completeLogin(partner);
  }

  private async issueSession(partner: Partner): Promise<PartnerSessionResult> {
    const { raw, hash } = generateToken('pts');
    await this.prisma.partnerSession.create({
      data: { partnerId: partner.id, tokenHash: hash, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
    });
    return { token: raw, partner: { id: partner.id, email: partner.email, name: partner.name } };
  }

  /** Finish login: a 2FA challenge when enabled, otherwise a session. */
  private async completeLogin(partner: Partner): Promise<PartnerLoginOutcome> {
    if (partner.twoFactorEnabledAt) {
      const { raw, hash } = generateToken('pt2fc');
      await this.prisma.partnerTwoFactorChallenge.create({
        data: { partnerId: partner.id, tokenHash: hash, expiresAt: new Date(Date.now() + TWO_FA_TTL_MS) },
      });
      return { twoFactorRequired: true, challengeToken: raw };
    }
    return this.issueSession(partner);
  }

  // --- Google / Apple OAuth (sign-in for existing partners only) ------------

  async oauthLogin(input: { provider: OAuthProvider; idToken: string }): Promise<PartnerLoginOutcome> {
    const profile = await this.oauth.verify(input.provider, input.idToken).catch((e) => {
      throw new AuthError(`Sign-in with ${input.provider} failed: ${(e as Error).message}`);
    });
    const link = await this.prisma.partnerOAuthIdentity.findUnique({
      where: { provider_providerUserId: { provider: input.provider, providerUserId: profile.providerUserId } },
      include: { partner: true },
    });
    if (link) return this.completeLogin(link.partner);

    if (!profile.email) throw new AuthError('No partner account for this sign-in.');
    const partner = await this.prisma.partner.findUnique({ where: { email: this.normalizeEmail(profile.email) } });
    if (!partner) throw new AuthError('No partner account for this email.');
    await this.prisma.partnerOAuthIdentity.create({
      data: { partnerId: partner.id, provider: input.provider, providerUserId: profile.providerUserId, email: this.normalizeEmail(profile.email) },
    });
    return this.completeLogin(partner);
  }

  // --- Two-factor (TOTP) ----------------------------------------------------

  async setupTwoFactor(ctx: PartnerContext): Promise<{ secret: string; otpauthUrl: string }> {
    const partner = await this.prisma.partner.findUnique({ where: { id: ctx.partnerId } });
    if (!partner) throw new AuthError();
    const secret = generateTotpSecret();
    await this.prisma.partner.update({ where: { id: partner.id }, data: { twoFactorSecret: sealSecret(secret) } });
    return { secret, otpauthUrl: otpauthUrl(secret, partner.email, TWO_FA_ISSUER) };
  }

  async enableTwoFactor(ctx: PartnerContext, code: string): Promise<{ enabled: true }> {
    const partner = await this.prisma.partner.findUnique({ where: { id: ctx.partnerId } });
    const secret = openSecret(partner?.twoFactorSecret ?? null);
    if (!secret) throw new ValidationError('Start 2FA setup first.');
    if (!verifyTotp(secret, code)) throw new AuthError('That code is not valid. Try again.');
    await this.prisma.partner.update({ where: { id: ctx.partnerId }, data: { twoFactorEnabledAt: new Date() } });
    return { enabled: true };
  }

  async disableTwoFactor(ctx: PartnerContext, code: string): Promise<{ enabled: false }> {
    const partner = await this.prisma.partner.findUnique({ where: { id: ctx.partnerId } });
    const secret = openSecret(partner?.twoFactorSecret ?? null);
    if (!partner?.twoFactorEnabledAt || !secret) return { enabled: false };
    if (!verifyTotp(secret, code)) throw new AuthError('That code is not valid.');
    await this.prisma.partner.update({ where: { id: partner.id }, data: { twoFactorEnabledAt: null, twoFactorSecret: null } });
    return { enabled: false };
  }

  async verifyTwoFactor(challengeToken: string, code: string): Promise<PartnerSessionResult> {
    const challenge = await this.prisma.partnerTwoFactorChallenge.findUnique({ where: { tokenHash: hashToken(challengeToken) } });
    if (!challenge || challenge.consumedAt || challenge.expiresAt < new Date()) {
      throw new AuthError('This 2FA challenge has expired. Please sign in again.');
    }
    const partner = await this.prisma.partner.findUnique({ where: { id: challenge.partnerId } });
    const secret = openSecret(partner?.twoFactorSecret ?? null);
    if (!partner || !secret) throw new AuthError();
    if (!verifyTotp(secret, code)) throw new AuthError('That code is not valid. Try again.');
    await this.prisma.partnerTwoFactorChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
    return this.issueSession(partner);
  }

  async resolveSession(rawToken: string): Promise<PartnerContext> {
    const session = await this.prisma.partnerSession.findUnique({ where: { tokenHash: hashToken(rawToken) } });
    if (!session || session.expiresAt < new Date()) throw new AuthError('Partner session expired.');
    const partner = await this.prisma.partner.findUnique({ where: { id: session.partnerId } });
    if (!partner) throw new AuthError();
    void this.prisma.partnerSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
    return { partnerId: partner.id, email: partner.email, name: partner.name };
  }

  async logout(rawToken: string): Promise<void> {
    await this.prisma.partnerSession.deleteMany({ where: { tokenHash: hashToken(rawToken) } });
  }

  async me(ctx: PartnerContext) {
    const partner = await this.prisma.partner.findUnique({
      where: { id: ctx.partnerId },
      include: { oauthIdentities: { select: { provider: true } } },
    });
    return {
      id: ctx.partnerId,
      email: ctx.email,
      name: ctx.name,
      auth: {
        twoFactorEnabled: Boolean(partner?.twoFactorEnabledAt),
        oauthProviders: partner?.oauthIdentities.map((o) => o.provider) ?? [],
      },
    };
  }
}
