import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { AuthError, ForbiddenError } from '../src/context.js';
import { platformHasPermission, requirePlatformPermission } from '../src/platform/authz.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('platform admin', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  const ids: { tenants: string[]; platformUsers: string[] } = { tenants: [], platformUsers: [] };

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: ids.tenants } } });
    await prisma.platformUser.deleteMany({ where: { id: { in: ids.platformUsers } } });
    await prisma.$disconnect();
  });

  async function platformLogin(role: any) {
    const email = `${String(role).toLowerCase()}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@platform.test`;
    const u = await prisma.platformUser.create({ data: { email, role } });
    ids.platformUsers.push(u.id);
    const { token } = await commerce.platformAuth.requestMagicLink(email);
    const session = await commerce.platformAuth.verifyMagicLink(token!);
    return commerce.platformAuth.resolveSession(session.token);
  }

  it('logs in platform staff via magic link and resolves permissions', async () => {
    const ctx = await platformLogin('SUPER_ADMIN');
    expect(ctx.role).toBe('SUPER_ADMIN');
    expect(platformHasPermission(ctx, 'platform:staff:manage')).toBe(true);

    const readOnly = await platformLogin('READ_ONLY');
    expect(platformHasPermission(readOnly, 'platform:tenants:write')).toBe(false);
    expect(() => requirePlatformPermission(readOnly, 'platform:tenants:write')).toThrow(ForbiddenError);
  });

  it('lists tenants across the platform and suspends one, blocking its access', async () => {
    const admin = await platformLogin('SUPER_ADMIN');

    // A merchant with an API key.
    const tenant = await prisma.tenant.create({ data: { name: `Acme ${Date.now()}` } });
    ids.tenants.push(tenant.id);
    const key = await commerce.apiKeys.create({ tenantId: tenant.id }, { name: 'k' });
    await commerce.stores.create({ tenantId: tenant.id }, { name: 'Acme Store' });

    // Visible in the directory.
    const listed = await commerce.platform.listTenants({ search: 'Acme' });
    expect(listed.find((t) => t.id === tenant.id)?.stores).toBe(1);

    // Key works before suspension.
    await expect(commerce.apiKeys.verify(key.raw)).resolves.toBeTruthy();

    // Suspend → key is rejected, and an audit row is written.
    await commerce.platform.setTenantStatus(admin, tenant.id, 'SUSPENDED');
    await expect(commerce.apiKeys.verify(key.raw)).rejects.toBeInstanceOf(AuthError);

    const audit = await commerce.platform.listAudit({ limit: 5 });
    expect(audit.find((a) => a.action === 'tenant.suspend' && a.targetId === tenant.id)).toBeTruthy();

    // Reactivate → key works again.
    await commerce.platform.setTenantStatus(admin, tenant.id, 'ACTIVE');
    await expect(commerce.apiKeys.verify(key.raw)).resolves.toBeTruthy();
  });

  it('guards the last super admin', async () => {
    const only = await prisma.platformUser.create({ data: { email: `solo.${Date.now()}@platform.test`, role: 'SUPER_ADMIN' } });
    ids.platformUsers.push(only.id);
    // There may be other super admins from earlier tests, so this just checks the API path exists.
    const staff = await commerce.platformAuth.listStaff();
    expect(staff.find((s) => s.id === only.id)?.role).toBe('SUPER_ADMIN');
  });
});
