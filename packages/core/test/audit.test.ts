import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { type TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('merchant audit log', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Audit Co' } });
    ctx = { tenantId: tenant.id };
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('records entries and lists them tenant-scoped, newest first, with filters', async () => {
    await commerce.audit.record({ tenantId: ctx.tenantId, actorKind: 'user', actorId: 'u1', action: 'products.create', method: 'POST', path: '/products', resource: 'products', statusCode: 201 });
    await commerce.audit.record({ tenantId: ctx.tenantId, actorKind: 'partner', actorId: 'p1', action: 'shopability.update', method: 'PUT', path: '/shopability', resource: 'shopability', statusCode: 200 });

    const all = await commerce.audit.list(ctx, {});
    expect(all.length).toBe(2);
    expect(all[0].action).toBe('shopability.update'); // newest first

    const partnerOnly = await commerce.audit.list(ctx, { actorKind: 'partner' });
    expect(partnerOnly.length).toBe(1);
    expect(partnerOnly[0].actorKind).toBe('partner');

    const byResource = await commerce.audit.list(ctx, { resource: 'products' });
    expect(byResource.length).toBe(1);
  });

  it('is isolated per tenant', async () => {
    const other = await prisma.tenant.create({ data: { name: 'Other Audit' } });
    const list = await commerce.audit.list({ tenantId: other.id }, {});
    expect(list.length).toBe(0);
    await prisma.tenant.delete({ where: { id: other.id } }).catch(() => undefined);
  });

  it('never throws on a bad write', async () => {
    // Non-existent tenant FK → the create fails internally but record() swallows it.
    await expect(commerce.audit.record({ tenantId: 'nope', actorKind: 'user', action: 'x.create', method: 'POST', path: '/x', statusCode: 200 })).resolves.toBeUndefined();
  });
});
