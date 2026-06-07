import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PlatformAuthService, type PlatformSessionResult } from '../src/services/platform-auth.service.js';
import { PartnerAuthService, type PartnerSessionResult } from '../src/services/partner-auth.service.js';
import type { OAuthProfile, OAuthVerifier } from '../src/auth/oauth.js';
import { totp } from '../src/crypto.js';
import { AuthError } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

class FakeVerifier implements OAuthVerifier {
  constructor(private profile: OAuthProfile) {}
  set(p: OAuthProfile) { this.profile = p; }
  async verify(): Promise<OAuthProfile> { return this.profile; }
}

const isSession = (x: any) => Boolean(x?.token);

describe.skipIf(!hasDb)('platform & partner 2FA + OAuth', () => {
  const prisma = new PrismaClient();
  const verifier = new FakeVerifier({ providerUserId: 'x', email: 'x@example.com' });
  const platformAuth = new PlatformAuthService(prisma, verifier);
  const partnerAuth = new PartnerAuthService(prisma, verifier);
  const tag = randomBytes(3).toString('hex');
  const opEmail = `op+${tag}@example.com`;
  const partnerEmail = `partner+${tag}@example.com`;
  let platformUserId = '';
  let partnerId = '';

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const op = await prisma.platformUser.create({ data: { email: opEmail, name: 'Op', role: 'SUPER_ADMIN' } });
    platformUserId = op.id;
    const p = await prisma.partner.create({ data: { email: partnerEmail, name: 'Agency' } });
    partnerId = p.id;
  });

  afterAll(async () => {
    await prisma.platformUser.deleteMany({ where: { email: opEmail } }).catch(() => undefined);
    await prisma.partner.deleteMany({ where: { email: partnerEmail } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  // --- Platform operator ----------------------------------------------------

  it('platform: OAuth signs in existing staff, rejects unknown emails', async () => {
    verifier.set({ providerUserId: `op-${tag}`, email: opEmail, name: 'Op' });
    const out = await platformAuth.oauthLogin({ provider: 'GOOGLE', idToken: 'x' });
    expect(isSession(out)).toBe(true);
    expect((await prisma.platformOAuthIdentity.count({ where: { platformUserId } }))).toBe(1);

    // Repeat → same identity (no duplicate), still a session.
    const again = await platformAuth.oauthLogin({ provider: 'GOOGLE', idToken: 'x' });
    expect(isSession(again)).toBe(true);
    expect((await prisma.platformOAuthIdentity.count({ where: { platformUserId } }))).toBe(1);

    // Unknown email is never auto-provisioned.
    verifier.set({ providerUserId: `ghost-${tag}`, email: `ghost+${tag}@example.com` });
    await expect(platformAuth.oauthLogin({ provider: 'GOOGLE', idToken: 'x' })).rejects.toBeInstanceOf(AuthError);
  });

  it('platform: 2FA gates magic-link login and is exchanged for a session', async () => {
    const ctx = { platformUserId, actorEmail: opEmail, role: 'SUPER_ADMIN' as const, permissions: [] };
    const setup = await platformAuth.setupTwoFactor(ctx);
    expect(setup.otpauthUrl).toContain('otpauth://totp/');
    await expect(platformAuth.enableTwoFactor(ctx, '000000')).rejects.toBeInstanceOf(AuthError);
    await platformAuth.enableTwoFactor(ctx, totp(setup.secret));

    const { token } = await platformAuth.requestMagicLink(opEmail);
    const challenge = await platformAuth.verifyMagicLink(token!);
    expect(isSession(challenge)).toBe(false);
    expect((challenge as any).twoFactorRequired).toBe(true);

    await expect(platformAuth.verifyTwoFactor((challenge as any).challengeToken, '000000')).rejects.toBeInstanceOf(AuthError);
    const session = (await platformAuth.verifyTwoFactor((challenge as any).challengeToken, totp(setup.secret))) as PlatformSessionResult;
    expect(session.token).toBeTruthy();

    // Disable → magic-link login is a session again.
    await platformAuth.disableTwoFactor(ctx, totp(setup.secret));
    const { token: t2 } = await platformAuth.requestMagicLink(opEmail);
    expect(isSession(await platformAuth.verifyMagicLink(t2!))).toBe(true);
  });

  // --- Partner --------------------------------------------------------------

  it('partner: OAuth signs in existing partner, rejects unknown emails', async () => {
    verifier.set({ providerUserId: `pt-${tag}`, email: partnerEmail, name: 'Agency' });
    expect(isSession(await partnerAuth.oauthLogin({ provider: 'APPLE', idToken: 'x' }))).toBe(true);
    expect((await prisma.partnerOAuthIdentity.count({ where: { partnerId } }))).toBe(1);

    verifier.set({ providerUserId: `ptghost-${tag}`, email: `ptghost+${tag}@example.com` });
    await expect(partnerAuth.oauthLogin({ provider: 'APPLE', idToken: 'x' })).rejects.toBeInstanceOf(AuthError);
  });

  it('partner: 2FA gates magic-link login and is exchanged for a session', async () => {
    const ctx = { partnerId, email: partnerEmail, name: 'Agency' };
    const setup = await partnerAuth.setupTwoFactor(ctx);
    await partnerAuth.enableTwoFactor(ctx, totp(setup.secret));

    const { token } = await partnerAuth.requestMagicLink(partnerEmail);
    const challenge = await partnerAuth.verifyMagicLink(token!);
    expect((challenge as any).twoFactorRequired).toBe(true);
    const session = (await partnerAuth.verifyTwoFactor((challenge as any).challengeToken, totp(setup.secret))) as PartnerSessionResult;
    expect(session.token).toBeTruthy();

    await partnerAuth.disableTwoFactor(ctx, totp(setup.secret));
    const { token: t2 } = await partnerAuth.requestMagicLink(partnerEmail);
    expect(isSession(await partnerAuth.verifyMagicLink(t2!))).toBe(true);
  });
});
