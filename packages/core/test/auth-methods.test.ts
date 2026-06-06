import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { AuthService, type IssuedSession } from '../src/services/auth.service.js';
import type { OAuthProfile, OAuthVerifier } from '../src/auth/oauth.js';
import { totp } from '../src/crypto.js';
import { AuthError, type TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

// A fake OAuth verifier so social login is testable without network.
class FakeVerifier implements OAuthVerifier {
  constructor(private profile: OAuthProfile) {}
  set(p: OAuthProfile) { this.profile = p; }
  async verify(): Promise<OAuthProfile> { return this.profile; }
}

function isSession(x: any): x is IssuedSession {
  return Boolean(x?.token);
}

describe.skipIf(!hasDb)('auth methods (password / phone OTP / OAuth / 2FA)', () => {
  const prisma = new PrismaClient();
  const verifier = new FakeVerifier({ providerUserId: 'g-1', email: 'oauth@example.com', name: 'O Auth' });
  const auth = new AuthService(prisma, verifier);
  const emails: string[] = [];
  // Unique phone per run so re-runs don't collide on the global User.phone.
  const phone = `+9199${randomBytes(4).readUInt32BE(0).toString().padStart(8, '0').slice(0, 8)}`;

  beforeAll(() => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
  });

  afterAll(async () => {
    // Delete the users created here (and their tenants) — users are global, so
    // leaving them orphaned would break a re-run.
    const users = await prisma.user.findMany({
      where: { OR: [{ email: { in: emails } }, { phone }, { email: { contains: '@oauth.local' } }] },
      include: { memberships: true },
    });
    const tenantIds = [...new Set(users.flatMap((u) => u.memberships.map((m) => m.tenantId)))];
    await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } }).catch(() => undefined);
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('registers + logs in with email & password', async () => {
    const email = `pw+${randomBytes(3).toString('hex')}@example.com`;
    emails.push(email);
    const reg = await auth.registerWithPassword({ email, password: 'hunter2pass', name: 'Pat', tenantName: 'Pat Co' });
    expect(reg.token).toBeTruthy();
    expect(reg.role).toBe('OWNER');

    const ok = await auth.loginWithPassword({ email, password: 'hunter2pass' });
    expect(isSession(ok)).toBe(true);

    await expect(auth.loginWithPassword({ email, password: 'wrongpass1' })).rejects.toBeInstanceOf(AuthError);
    await expect(auth.loginWithPassword({ email: 'nobody@example.com', password: 'whatever1' })).rejects.toBeInstanceOf(AuthError);
  });

  it('rejects a too-short password at registration', async () => {
    await expect(auth.registerWithPassword({ email: `short@example.com`, password: 'short', tenantName: 'X' })).rejects.toBeTruthy();
  });

  it('signs in by phone OTP, creating the account on first use', async () => {
    const req = await auth.requestPhoneOtp(phone);
    expect(req.devCode).toMatch(/^\d{6}$/);

    await expect(auth.verifyPhoneOtp({ phone, code: '000000' })).rejects.toBeInstanceOf(AuthError);

    const out = await auth.verifyPhoneOtp({ phone, code: req.devCode!, name: 'Phone User' });
    expect(isSession(out)).toBe(true);
    const user = await prisma.user.findUnique({ where: { phone } });
    expect(user).toBeTruthy();

    // Second login finds the same user (no duplicate).
    const req2 = await auth.requestPhoneOtp(phone);
    const out2 = await auth.verifyPhoneOtp({ phone, code: req2.devCode! });
    expect(isSession(out2)).toBe(true);
    expect((await prisma.user.count({ where: { phone } }))).toBe(1);
  });

  it('signs in with Google OAuth: creates a user, then links on repeat', async () => {
    verifier.set({ providerUserId: `g-${randomBytes(3).toString('hex')}`, email: `g+${randomBytes(3).toString('hex')}@example.com`, name: 'Gee' });
    const first = await auth.oauthLogin({ provider: 'GOOGLE', idToken: 'x' });
    expect(isSession(first)).toBe(true);
    const linked = await prisma.oAuthIdentity.count({ where: { provider: 'GOOGLE' } });
    expect(linked).toBeGreaterThanOrEqual(1);

    // Same provider subject → logs in the same user (no new identity row).
    const before = await prisma.oAuthIdentity.count();
    await auth.oauthLogin({ provider: 'GOOGLE', idToken: 'x' });
    expect(await prisma.oAuthIdentity.count()).toBe(before);
  });

  it('links OAuth to an existing email account', async () => {
    const email = `link+${randomBytes(3).toString('hex')}@example.com`;
    emails.push(email);
    await auth.registerWithPassword({ email, password: 'linkpass12', tenantName: 'Link Co' });
    verifier.set({ providerUserId: `a-${randomBytes(3).toString('hex')}`, email, name: 'Linker' });
    const out = await auth.oauthLogin({ provider: 'APPLE', idToken: 'x' });
    expect(isSession(out)).toBe(true);
    const u = await prisma.user.findUnique({ where: { email }, include: { oauthIdentities: true } });
    expect(u?.oauthIdentities.some((o) => o.provider === 'APPLE')).toBe(true);
  });

  it('enforces TOTP 2FA: login returns a challenge, exchanged for a session', async () => {
    const email = `2fa+${randomBytes(3).toString('hex')}@example.com`;
    emails.push(email);
    const reg = await auth.registerWithPassword({ email, password: 'twofapass1', tenantName: '2FA Co' });
    const ctx: TenantContext = { tenantId: reg.tenantId, actor: { kind: 'user', userId: reg.user.id, role: 'OWNER', permissions: [] } };

    const setup = await auth.setupTwoFactor(ctx);
    expect(setup.otpauthUrl).toContain('otpauth://totp/');
    // Enabling requires a valid current code.
    await expect(auth.enableTwoFactor(ctx, '000000')).rejects.toBeInstanceOf(AuthError);
    await auth.enableTwoFactor(ctx, totp(setup.secret));

    // Password login now returns a 2FA challenge, not a session.
    const challenge = await auth.loginWithPassword({ email, password: 'twofapass1' });
    expect(isSession(challenge)).toBe(false);
    expect((challenge as any).twoFactorRequired).toBe(true);

    // Wrong code rejected; correct code yields a session.
    await expect(auth.verifyTwoFactor((challenge as any).challengeToken, '000000')).rejects.toBeInstanceOf(AuthError);
    const session = await auth.verifyTwoFactor((challenge as any).challengeToken, totp(setup.secret));
    expect(session.token).toBeTruthy();

    // Disable with a valid code → login is a session again.
    await auth.disableTwoFactor(ctx, totp(setup.secret));
    const after = await auth.loginWithPassword({ email, password: 'twofapass1' });
    expect(isSession(after)).toBe(true);
  });
});
