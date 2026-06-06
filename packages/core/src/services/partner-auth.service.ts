import type { Partner, PrismaClient } from '@prisma/client';
import { AuthError, ValidationError } from '../context.js';
import { generateToken, hashToken } from '../crypto.js';

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

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

/**
 * Authentication for partners/agencies. Mirrors the platform magic-link flow on
 * its own identity plane (Partner). Partners are provisioned by a platform
 * operator (or the seed); there is no self-signup.
 */
export class PartnerAuthService {
  constructor(private readonly prisma: PrismaClient) {}

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

  async verifyMagicLink(rawToken: string): Promise<PartnerSessionResult> {
    const token = await this.prisma.partnerMagicLinkToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
    if (!token || token.consumedAt || token.expiresAt < new Date()) {
      throw new AuthError('Invalid or expired login link.');
    }
    await this.prisma.partnerMagicLinkToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } });
    const partner = await this.prisma.partner.findUnique({ where: { email: token.email } });
    if (!partner) throw new AuthError('No partner account for this email.');
    return this.issueSession(partner);
  }

  private async issueSession(partner: Partner): Promise<PartnerSessionResult> {
    const { raw, hash } = generateToken('pts');
    await this.prisma.partnerSession.create({
      data: { partnerId: partner.id, tokenHash: hash, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
    });
    return { token: raw, partner: { id: partner.id, email: partner.email, name: partner.name } };
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

  me(ctx: PartnerContext) {
    return { id: ctx.partnerId, email: ctx.email, name: ctx.name };
  }
}
