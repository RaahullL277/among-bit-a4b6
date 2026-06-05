import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { AuthError, ValidationError } from '../src/context.js';
import { actorHasPermission, permissionsForRole } from '../src/authz.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('auth & rbac', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  const tenantIds: string[] = [];

  beforeAll(() => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
  });

  afterAll(async () => {
    if (tenantIds.length) await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { email: { contains: '@authtest.local' } } });
    await prisma.$disconnect();
  });

  it('signs up a tenant owner and resolves their session', async () => {
    const session = await commerce.auth.signup({
      email: `owner+${Date.now()}@authtest.local`,
      tenantName: 'Auth Co',
    });
    tenantIds.push(session.tenantId);
    expect(session.role).toBe('OWNER');
    expect(session.token.startsWith('ses_')).toBe(true);

    const ctx = await commerce.auth.resolveSession(session.token);
    expect(ctx.actor?.kind).toBe('user');
    expect(actorHasPermission(ctx.actor, 'apikeys:manage')).toBe(true);
  });

  it('logs in via magic link', async () => {
    const email = `login+${Date.now()}@authtest.local`;
    const s = await commerce.auth.signup({ email, tenantName: 'Login Co' });
    tenantIds.push(s.tenantId);

    const { token } = await commerce.auth.requestMagicLink(email);
    const session = await commerce.auth.verifyMagicLink(token);
    expect(session.user.email).toBe(email);

    // Single-use: a second verify fails.
    await expect(commerce.auth.verifyMagicLink(token)).rejects.toBeInstanceOf(AuthError);
  });

  it('invites a STAFF member who then has limited permissions', async () => {
    const owner = await commerce.auth.signup({
      email: `o2+${Date.now()}@authtest.local`,
      tenantName: 'Invite Co',
    });
    tenantIds.push(owner.tenantId);
    const ownerCtx = await commerce.auth.resolveSession(owner.token);

    const staffEmail = `staff+${Date.now()}@authtest.local`;
    const { token } = await commerce.members.createInvite(ownerCtx, { email: staffEmail, role: 'STAFF' });
    const staffSession = await commerce.auth.acceptInvite(token);
    expect(staffSession.role).toBe('STAFF');

    const staffCtx = await commerce.auth.resolveSession(staffSession.token);
    expect(actorHasPermission(staffCtx.actor, 'products:write')).toBe(true);
    expect(actorHasPermission(staffCtx.actor, 'integrations:write')).toBe(false);
    expect(actorHasPermission(staffCtx.actor, 'members:manage')).toBe(false);

    const members = await commerce.members.listMembers(ownerCtx);
    expect(members.map((m) => m.email)).toContain(staffEmail);
  });

  it('refuses to remove the last owner', async () => {
    const owner = await commerce.auth.signup({
      email: `solo+${Date.now()}@authtest.local`,
      tenantName: 'Solo Co',
    });
    tenantIds.push(owner.tenantId);
    const ctx = await commerce.auth.resolveSession(owner.token);
    const userId = (ctx.actor as any).userId as string;
    await expect(commerce.members.removeMember(ctx, userId)).rejects.toBeInstanceOf(ValidationError);
  });

  it('maps roles to expected permission sets', () => {
    expect(permissionsForRole('STAFF')).not.toContain('integrations:write');
    expect(permissionsForRole('ADMIN')).toContain('integrations:write');
    expect(permissionsForRole('ADMIN')).not.toContain('apikeys:manage');
    expect(permissionsForRole('OWNER')).toContain('apikeys:manage');
  });
});
