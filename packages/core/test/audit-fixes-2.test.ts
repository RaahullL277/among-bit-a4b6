import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { ForbiddenError, NotFoundError, type TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

// Regression tests for the second audit pass: privilege escalation, SSRF, IDOR.
describe.skipIf(!hasDb)('audit fixes — authz, SSRF, IDOR', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctxA: TenantContext; // tenant A (admin actor)
  let ctxB: TenantContext; // tenant B
  let storeA: string;
  let productB: string;
  let adminUserId: string;
  let staffUserId: string;

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const a = await prisma.tenant.create({ data: { name: 'Sec A' } });
    const b = await prisma.tenant.create({ data: { name: 'Sec B' } });
    ctxB = { tenantId: b.id };
    const sA = await commerce.stores.create({ tenantId: a.id }, { name: 'A Store' });
    storeA = sA.id;
    const sB = await commerce.stores.create(ctxB, { name: 'B Store' });
    const pB = await commerce.products.create(ctxB, { storeId: sB.id, title: 'B Product', status: 'ACTIVE', variants: [{ priceMinor: 1000 }] });
    productB = pB.id;
    // An ADMIN and a STAFF member of tenant A (unique emails — User.email is global).
    const sfx = randomBytes(4).toString('hex');
    const admin = await prisma.user.create({ data: { email: `admin-${sfx}@a.com` } });
    const staff = await prisma.user.create({ data: { email: `staff-${sfx}@a.com` } });
    adminUserId = admin.id;
    staffUserId = staff.id;
    await prisma.membership.create({ data: { userId: admin.id, tenantId: a.id, role: 'ADMIN' } });
    await prisma.membership.create({ data: { userId: staff.id, tenantId: a.id, role: 'STAFF' } });
    ctxA = { tenantId: a.id, actor: { kind: 'user', userId: admin.id, role: 'ADMIN', permissions: [] } };
  });

  afterAll(async () => {
    await prisma.membership.deleteMany({ where: { userId: { in: [adminUserId, staffUserId] } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: [adminUserId, staffUserId] } } }).catch(() => undefined);
    await prisma.tenant.deleteMany({ where: { name: { in: ['Sec A', 'Sec B'] } } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('an ADMIN cannot invite or promote anyone to OWNER (privilege escalation)', async () => {
    await expect(commerce.members.createInvite(ctxA, { email: 'x@a.com', role: 'OWNER' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(commerce.members.changeRole(ctxA, staffUserId, 'OWNER')).rejects.toBeInstanceOf(ForbiddenError);
    // …but ADMIN-level management of a STAFF member is still allowed.
    const ok = await commerce.members.changeRole(ctxA, staffUserId, 'ADMIN');
    expect(ok.role).toBe('ADMIN');
  });

  it('blocks SSRF: a live import cannot target a private/loopback host', async () => {
    const fetchSpy = vi.fn();
    for (const url of ['http://169.254.169.254', 'https://localhost/x', 'https://10.0.0.5', 'http://127.0.0.1:8080']) {
      await expect(
        commerce.imports.runFromApi(ctxA, { storeId: storeA, source: 'WOOCOMMERCE', kind: 'products', credentials: { url, consumerKey: 'k', consumerSecret: 's' } } as any, fetchSpy as any),
      ).rejects.toBeTruthy();
    }
    expect(fetchSpy).not.toHaveBeenCalled(); // never even attempted the request
  });

  it('prevents cross-tenant image IDOR via listForProduct', async () => {
    // Tenant A asks for tenant B's product images → denied.
    await expect(commerce.images.listForProduct(ctxA, productB)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('prevents cross-tenant FBT IDOR via suggestionsForStore', async () => {
    const sB = await prisma.store.findFirst({ where: { tenantId: ctxB.tenantId } });
    await expect(commerce.offers.suggestionsForStore(ctxA, sB!.id, productB)).rejects.toBeInstanceOf(NotFoundError);
  });
});
