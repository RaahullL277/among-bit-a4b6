import type { OAuthProvider, PrismaClient, Role, User } from '@prisma/client';
import { AuthError, ValidationError, type TenantContext } from '../context.js';
import {
  decryptJson,
  encryptJson,
  generateNumericOtp,
  generateTotpSecret,
  generateToken,
  hashPassword,
  hashToken,
  otpauthUrl,
  verifyPassword,
  verifyTotp,
} from '../crypto.js';
import { permissionsForRole } from '../authz.js';
import { HttpOAuthVerifier, type OAuthProfile, type OAuthVerifier } from '../auth/oauth.js';

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000; // 15 minutes
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const OTP_RESEND_COOLDOWN_MS = 30 * 1000; // min gap between code re-sends
const OTP_MAX_ATTEMPTS = 5;
const TWO_FA_TTL_MS = 10 * 60 * 1000; // 10 minutes to complete the 2FA step
const TWO_FA_ISSUER = process.env.TWO_FA_ISSUER ?? 'ACP Commerce';
const isProd = process.env.NODE_ENV === 'production';

export interface IssuedSession {
  token: string;
  tenantId: string;
  role: Role;
  user: { id: string; email: string; name: string | null };
}

/** Returned instead of a session when the account has 2FA enabled. */
export interface TwoFactorPending {
  twoFactorRequired: true;
  challengeToken: string;
}

export type LoginOutcome = IssuedSession | TwoFactorPending;

/** Delivers an OTP code to a phone/email (best-effort). Dev returns it instead. */
export type OtpSender = (to: string, code: string, channel: 'sms' | 'email') => Promise<void>;

/**
 * User authentication for the merchant plane. Supports several sign-in methods —
 * passwordless magic link, email + password, phone-number OTP, and Google/Apple
 * OAuth — each optionally protected by TOTP two-factor. Operates across tenants
 * (pre-auth), so unlike the commerce services it is not bound to a TenantContext.
 */
export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly oauth: OAuthVerifier = new HttpOAuthVerifier(),
    private readonly otpSender?: OtpSender,
  ) {}

  private normalizeEmail(email: string): string {
    const e = email?.trim().toLowerCase();
    if (!e || !e.includes('@')) throw new ValidationError('A valid email is required.');
    return e;
  }

  private normalizePhone(phone: string): string {
    const p = String(phone ?? '').replace(/[\s\-()]/g, '');
    if (!/^\+?\d{8,15}$/.test(p)) throw new ValidationError('A valid phone number is required (E.164, e.g. +919812345678).');
    return p.startsWith('+') ? p : `+${p}`;
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
  async verifyMagicLink(rawToken: string): Promise<LoginOutcome> {
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

    return this.completeLogin(user);
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

  // --- Email + password -----------------------------------------------------

  /** Register a new merchant account with an email + password (bootstraps a tenant). */
  async registerWithPassword(input: { email: string; password: string; name?: string; tenantName: string }): Promise<IssuedSession> {
    const email = this.normalizeEmail(input.email);
    if (!input.tenantName?.trim()) throw new ValidationError('A workspace name is required.');
    const passwordHash = hashPassword(input.password); // enforces min length
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ValidationError('An account with this email already exists. Sign in instead.');

    const tenant = await this.prisma.tenant.create({ data: { name: input.tenantName.trim() } });
    const user = await this.prisma.user.create({ data: { email, name: input.name, passwordHash } });
    await this.prisma.membership.create({ data: { userId: user.id, tenantId: tenant.id, role: 'OWNER' } });
    return this.issueSession(user, tenant.id, 'OWNER');
  }

  /** Sign in with email + password. Returns a 2FA challenge if 2FA is enabled. */
  async loginWithPassword(input: { email: string; password: string }): Promise<LoginOutcome> {
    const email = this.normalizeEmail(input.email);
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Constant-ish failure: verifyPassword(null) returns false without leaking existence.
    if (!user || !verifyPassword(input.password, user.passwordHash)) {
      throw new AuthError('Invalid email or password.');
    }
    return this.completeLogin(user);
  }

  /** Set or change the signed-in user's password. */
  async setPassword(ctx: TenantContext, password: string): Promise<{ ok: true }> {
    if (ctx.actor?.kind !== 'user') throw new AuthError('Only a signed-in user can set a password.');
    await this.prisma.user.update({ where: { id: ctx.actor.userId }, data: { passwordHash: hashPassword(password) } });
    return { ok: true };
  }

  // --- Phone-number OTP -----------------------------------------------------

  /** Send a one-time login code to a phone number (SMS). Dev returns the code. */
  async requestPhoneOtp(phone: string): Promise<{ sent: true; devCode?: string }> {
    const normalized = this.normalizePhone(phone);
    // Resend cooldown (production): suppress re-issue if an unconsumed code was
    // just sent — caps SMS-bombing and brute-force amplification via resends.
    if (isProd) {
      const recent = await this.prisma.otpCode.findFirst({
        where: { identifier: normalized, channel: 'sms', consumedAt: null, createdAt: { gt: new Date(Date.now() - OTP_RESEND_COOLDOWN_MS) } },
        select: { id: true },
      });
      if (recent) return { sent: true };
    }
    const code = generateNumericOtp(6);
    await this.prisma.otpCode.create({
      data: { identifier: normalized, channel: 'sms', codeHash: hashToken(code), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
    });
    if (this.otpSender) await this.otpSender(normalized, code, 'sms').catch(() => undefined);
    return isProd ? { sent: true } : { sent: true, devCode: code };
  }

  /**
   * Verify a phone OTP and sign in. Creates the user (and a workspace) on first
   * login. Returns a 2FA challenge if the account has 2FA enabled.
   */
  async verifyPhoneOtp(input: { phone: string; code: string; name?: string; tenantName?: string }): Promise<LoginOutcome> {
    const phone = this.normalizePhone(input.phone);
    const otp = await this.prisma.otpCode.findFirst({
      where: { identifier: phone, channel: 'sms', consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.expiresAt < new Date()) throw new AuthError('This code has expired. Request a new one.');
    if (otp.attempts >= OTP_MAX_ATTEMPTS) throw new AuthError('Too many attempts. Request a new code.');
    if (otp.codeHash !== hashToken(String(input.code ?? '').trim())) {
      await this.prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw new AuthError('Incorrect code.');
    }
    await this.prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });

    let user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) {
      // First-time phone login → create the user + a workspace they own.
      const tenant = await this.prisma.tenant.create({ data: { name: input.tenantName?.trim() || `${input.name?.trim() || 'My'} store` } });
      // email is required + unique; synthesize a placeholder for a phone-first
      // account (the owner can add a real email later).
      user = await this.prisma.user.create({ data: { phone, name: input.name, email: `${phone.replace('+', '')}@phone.local` } });
      await this.prisma.membership.create({ data: { userId: user.id, tenantId: tenant.id, role: 'OWNER' } });
    }
    return this.completeLogin(user);
  }

  // --- Google / Apple OAuth -------------------------------------------------

  /**
   * Sign in with a Google/Apple id-token. Links the social identity to an
   * existing user by email, or creates a new user + workspace. Returns a 2FA
   * challenge if the account has 2FA enabled.
   */
  async oauthLogin(input: { provider: OAuthProvider; idToken: string; tenantName?: string }): Promise<LoginOutcome> {
    const profile: OAuthProfile = await this.oauth.verify(input.provider, input.idToken).catch((e) => {
      throw new AuthError(`Sign-in with ${input.provider} failed: ${(e as Error).message}`);
    });

    // Already linked? Sign that user in.
    const link = await this.prisma.oAuthIdentity.findUnique({
      where: { provider_providerUserId: { provider: input.provider, providerUserId: profile.providerUserId } },
      include: { user: true },
    });
    if (link) return this.completeLogin(link.user);

    const email = profile.email ? this.normalizeEmail(profile.email) : undefined;
    let user = email ? await this.prisma.user.findUnique({ where: { email } }) : null;

    if (!user) {
      // New user → create them + a workspace they own.
      const tenant = await this.prisma.tenant.create({ data: { name: input.tenantName?.trim() || `${profile.name?.trim() || email?.split('@')[0] || 'My'} store` } });
      user = await this.prisma.user.create({ data: { email: email ?? `${input.provider.toLowerCase()}_${profile.providerUserId}@oauth.local`, name: profile.name } });
      await this.prisma.membership.create({ data: { userId: user.id, tenantId: tenant.id, role: 'OWNER' } });
    }
    // Link the social identity to the user for next time.
    await this.prisma.oAuthIdentity.create({
      data: { userId: user.id, provider: input.provider, providerUserId: profile.providerUserId, email },
    });
    return this.completeLogin(user);
  }

  // --- Two-factor (TOTP) ----------------------------------------------------

  /** Begin 2FA setup: returns a secret + otpauth URI (not yet enabled). */
  async setupTwoFactor(ctx: TenantContext): Promise<{ secret: string; otpauthUrl: string }> {
    if (ctx.actor?.kind !== 'user') throw new AuthError('Only a signed-in user can set up 2FA.');
    const user = await this.prisma.user.findUnique({ where: { id: ctx.actor.userId } });
    if (!user) throw new AuthError();
    const secret = generateTotpSecret();
    // Store the (encrypted) secret now, but don't enable until a code is confirmed.
    await this.prisma.user.update({ where: { id: user.id }, data: { twoFactorSecret: this.storeSecret(secret) } });
    return { secret, otpauthUrl: otpauthUrl(secret, user.email, TWO_FA_ISSUER) };
  }

  /** Confirm a TOTP code to turn 2FA on. */
  async enableTwoFactor(ctx: TenantContext, code: string): Promise<{ enabled: true }> {
    if (ctx.actor?.kind !== 'user') throw new AuthError('Only a signed-in user can enable 2FA.');
    const user = await this.prisma.user.findUnique({ where: { id: ctx.actor.userId } });
    const secret = this.readSecret(user?.twoFactorSecret ?? null);
    if (!secret) throw new ValidationError('Start 2FA setup first.');
    if (!verifyTotp(secret, code)) throw new AuthError('That code is not valid. Try again.');
    await this.prisma.user.update({ where: { id: ctx.actor.userId }, data: { twoFactorEnabledAt: new Date() } });
    return { enabled: true };
  }

  /** Turn 2FA off (requires a current valid code). */
  async disableTwoFactor(ctx: TenantContext, code: string): Promise<{ enabled: false }> {
    if (ctx.actor?.kind !== 'user') throw new AuthError('Only a signed-in user can disable 2FA.');
    const user = await this.prisma.user.findUnique({ where: { id: ctx.actor.userId } });
    const secret = this.readSecret(user?.twoFactorSecret ?? null);
    if (!user?.twoFactorEnabledAt || !secret) return { enabled: false };
    if (!verifyTotp(secret, code)) throw new AuthError('That code is not valid.');
    await this.prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabledAt: null, twoFactorSecret: null } });
    return { enabled: false };
  }

  /** Exchange a 2FA challenge + TOTP code for a session. */
  async verifyTwoFactor(challengeToken: string, code: string): Promise<IssuedSession> {
    const challenge = await this.prisma.twoFactorChallenge.findUnique({ where: { tokenHash: hashToken(challengeToken) } });
    if (!challenge || challenge.consumedAt || challenge.expiresAt < new Date()) {
      throw new AuthError('This 2FA challenge has expired. Please sign in again.');
    }
    const user = await this.prisma.user.findUnique({ where: { id: challenge.userId } });
    const secret = this.readSecret(user?.twoFactorSecret ?? null);
    if (!user || !secret) throw new AuthError();
    if (!verifyTotp(secret, code)) throw new AuthError('That code is not valid. Try again.');
    await this.prisma.twoFactorChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
    const m = await this.primaryMembership(user.id);
    return this.issueSession(user, m.tenantId, m.role);
  }

  // --- Sessions -------------------------------------------------------------

  private async issueSession(user: User, tenantId: string, role: Role): Promise<IssuedSession> {
    const { raw, hash } = generateToken('ses');
    await this.prisma.session.create({
      data: { userId: user.id, tenantId, tokenHash: hash, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
    });
    return { token: raw, tenantId, role, user: { id: user.id, email: user.email, name: user.name } };
  }

  /** The user's first/primary membership (tenant + role). */
  private async primaryMembership(userId: string) {
    const m = await this.prisma.membership.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } });
    if (!m) throw new AuthError('Your account is not a member of any workspace.');
    return m;
  }

  /**
   * Finish a login: if the account has 2FA enabled, issue a short-lived
   * challenge to be exchanged via verifyTwoFactor; otherwise issue a session
   * for the user's primary workspace.
   */
  private async completeLogin(user: User): Promise<LoginOutcome> {
    if (user.twoFactorEnabledAt) {
      const { raw, hash } = generateToken('2fc');
      await this.prisma.twoFactorChallenge.create({
        data: { userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + TWO_FA_TTL_MS) },
      });
      return { twoFactorRequired: true, challengeToken: raw };
    }
    const m = await this.primaryMembership(user.id);
    return this.issueSession(user, m.tenantId, m.role);
  }

  // --- 2FA secret storage (encrypted at rest) -------------------------------

  private storeSecret(secretBase32: string): string {
    return JSON.stringify(encryptJson(secretBase32));
  }
  private readSecret(stored: string | null): string | null {
    if (!stored) return null;
    try {
      return decryptJson<string>(JSON.parse(stored));
    } catch {
      return null;
    }
  }

  /** Resolve a session token into a TenantContext with a user actor. */
  async resolveSession(rawToken: string): Promise<TenantContext> {
    const session = await this.prisma.session.findUnique({ where: { tokenHash: hashToken(rawToken) } });
    if (!session || session.expiresAt < new Date()) throw new AuthError('Session expired. Please sign in again.');

    const membership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId: session.userId, tenantId: session.tenantId } },
      include: { tenant: { select: { status: true } } },
    });
    if (!membership) throw new AuthError('Your access to this workspace was removed.');
    if (membership.tenant.status === 'SUSPENDED') throw new AuthError('This workspace has been suspended.');

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
    if (ctx.actor?.kind === 'partner') {
      return { actor: 'partner' as const, tenantId: ctx.tenantId, role: 'ADMIN' as Role, permissions };
    }
    if (ctx.actor?.kind !== 'user') {
      return { actor: 'apiKey' as const, tenantId: ctx.tenantId, role: 'OWNER' as Role, permissions };
    }
    const user = await this.prisma.user.findUnique({
      where: { id: ctx.actor.userId },
      include: { memberships: { include: { tenant: true } }, oauthIdentities: { select: { provider: true } } },
    });
    if (!user) throw new AuthError();
    return {
      actor: 'user' as const,
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      tenantId: ctx.tenantId,
      role: ctx.actor.role,
      permissions,
      // Which sign-in methods are set up + whether 2FA is on.
      auth: {
        hasPassword: Boolean(user.passwordHash),
        hasPhone: Boolean(user.phone),
        twoFactorEnabled: Boolean(user.twoFactorEnabledAt),
        oauthProviders: user.oauthIdentities.map((o) => o.provider),
      },
      memberships: user.memberships.map((m) => ({
        tenantId: m.tenantId,
        tenantName: m.tenant.name,
        role: m.role,
      })),
    };
  }
}
