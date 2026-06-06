import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { ValidationError, type TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('order status state machine', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;
  let n = 5000;

  async function order(status: any) {
    return prisma.order.create({ data: { tenantId: ctx.tenantId, storeId, number: n++, status, totalMinor: 1000 } });
  }

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Order Co' } });
    ctx = { tenantId: tenant.id };
    storeId = (await commerce.stores.create(ctx, { name: 'Order Store' })).id;
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('allows valid transitions and rejects illegal ones', async () => {
    const a = await order('PENDING');
    expect((await commerce.orders.updateStatus(ctx, a.id, 'PAID')).status).toBe('PAID');
    expect((await commerce.orders.updateStatus(ctx, a.id, 'FULFILLED')).status).toBe('FULFILLED');

    // Illegal: PAID → PENDING, FULFILLED → PAID, terminal moves.
    const b = await order('PAID');
    await expect(commerce.orders.updateStatus(ctx, b.id, 'PENDING')).rejects.toBeInstanceOf(ValidationError);
    await expect(commerce.orders.updateStatus(ctx, a.id, 'PAID')).rejects.toBeInstanceOf(ValidationError); // a is FULFILLED
    const c = await order('CANCELLED');
    await expect(commerce.orders.updateStatus(ctx, c.id, 'PAID')).rejects.toBeInstanceOf(ValidationError); // terminal

    // Same-status is a no-op (idempotent), not an error.
    expect((await commerce.orders.updateStatus(ctx, b.id, 'PAID')).status).toBe('PAID');
  });
});
