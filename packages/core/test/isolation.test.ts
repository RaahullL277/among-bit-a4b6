import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { NotFoundError } from '../src/context.js';

/**
 * Verifies multi-tenant isolation against a real database: a store created by
 * one tenant must be invisible to another. Skips when DATABASE_URL is unset so
 * the pure unit tests can still run without Postgres.
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('tenant isolation', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  const tenantIds: string[] = [];

  beforeAll(() => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
  });

  afterAll(async () => {
    if (tenantIds.length) {
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    }
    await prisma.$disconnect();
  });

  it('does not leak a store across tenants', async () => {
    const a = await prisma.tenant.create({ data: { name: 'A' } });
    const b = await prisma.tenant.create({ data: { name: 'B' } });
    tenantIds.push(a.id, b.id);

    const store = await commerce.stores.create({ tenantId: a.id }, { name: 'A Store' });

    // Tenant B cannot list or fetch tenant A's store.
    expect(await commerce.stores.list({ tenantId: b.id })).toHaveLength(0);
    await expect(commerce.stores.get({ tenantId: b.id }, store.id)).rejects.toBeInstanceOf(NotFoundError);

    // Tenant A can.
    expect((await commerce.stores.list({ tenantId: a.id })).map((s) => s.id)).toContain(store.id);
  });
});
