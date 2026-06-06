import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { type TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);
const DAY = 86_400_000;

describe.skipIf(!hasDb)('customer CRM (360° profile, segments, tags)', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;
  let variantId: string;

  // Make a paid order of `amount` for `customerId`, optionally dated in the past.
  async function paidOrder(customerId: string, amount: number, daysAgo = 0) {
    const created = new Date(Date.now() - daysAgo * DAY);
    const last = await prisma.order.aggregate({ where: { storeId }, _max: { number: true } });
    await prisma.order.create({
      data: {
        tenantId: ctx.tenantId,
        storeId,
        number: (last._max.number ?? 0) + 1,
        customerId,
        status: 'PAID',
        totalMinor: amount,
        createdAt: created,
        items: { create: [{ tenantId: ctx.tenantId, variantId, title: 'X', quantity: 1, unitPriceMinor: amount }] },
      },
    });
  }

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'CRM Co' } });
    ctx = { tenantId: tenant.id };
    const store = await commerce.stores.create(ctx, { name: 'CRM Store' });
    storeId = store.id;
    const product = await commerce.products.create(ctx, { storeId, title: 'Item', status: 'ACTIVE', variants: [{ priceMinor: 10000 }] });
    variantId = product.variants[0].id;
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('classifies customers into RFM-style segments', async () => {
    const neu = await commerce.customers.create(ctx, { storeId, name: 'New', email: 'new@example.com' });
    const repeat = await commerce.customers.create(ctx, { storeId, name: 'Repeat', email: 'repeat@example.com' });
    const vip = await commerce.customers.create(ctx, { storeId, name: 'Vip', email: 'vip@example.com' });
    const lapsed = await commerce.customers.create(ctx, { storeId, name: 'Lapsed', email: 'lapsed@example.com' });

    await paidOrder(repeat.id, 20000);
    await paidOrder(repeat.id, 30000);
    await paidOrder(vip.id, 600000); // > ₹5,000 lifetime → VIP
    await paidOrder(lapsed.id, 10000, 200); // last order 200 days ago → LAPSED

    const rows = await commerce.customers.list(ctx, storeId);
    const seg = (id: string) => rows.find((r) => r.id === id)!.segment;
    expect(seg(neu.id)).toBe('NEW');
    expect(seg(repeat.id)).toBe('REPEAT');
    expect(seg(vip.id)).toBe('VIP');
    expect(seg(lapsed.id)).toBe('LAPSED');

    // Per-customer spend is computed.
    expect(rows.find((r) => r.id === repeat.id)!.totalSpentMinor).toBe(50000);
  });

  it('builds a 360° profile with LTV, orders, and linked records', async () => {
    const c = await commerce.customers.create(ctx, { storeId, name: 'Profile', email: 'profile@example.com' });
    await paidOrder(c.id, 40000, 10);
    await paidOrder(c.id, 60000, 1);

    const p = await commerce.customers.profile(ctx, c.id);
    expect(p.metrics.lifetimeValueMinor).toBe(100000);
    expect(p.metrics.paidOrders).toBe(2);
    expect(p.metrics.aovMinor).toBe(50000);
    expect(p.metrics.daysSinceLastOrder).toBeLessThanOrEqual(2);
    expect(p.segment).toBe('REPEAT');
    expect(p.recentOrders.length).toBe(2);
    expect(p.loyalty).toBeNull();
  });

  it('supports tags, notes, and search', async () => {
    const c = await commerce.customers.create(ctx, { storeId, name: 'Tagged Tara', email: 'tara@example.com' });
    const updated = await commerce.customers.update(ctx, c.id, { tags: ['vip', 'wholesale', 'vip'], notes: 'Prefers WhatsApp' });
    expect(updated.tags).toEqual(['vip', 'wholesale']); // de-duped
    expect(updated.notes).toBe('Prefers WhatsApp');

    const byName = await commerce.customers.list(ctx, storeId, { search: 'tara' });
    expect(byName.map((r) => r.id)).toContain(c.id);
    const byEmail = await commerce.customers.list(ctx, storeId, { search: 'PROFILE@' });
    expect(byEmail.length).toBeGreaterThanOrEqual(1);
  });

  it('summarizes the store: counts, repeat rate, avg LTV, and segments', async () => {
    const s = await commerce.customers.summary(ctx, storeId);
    expect(s.customers).toBeGreaterThanOrEqual(6);
    expect(s.withOrders).toBeGreaterThanOrEqual(4);
    expect(s.avgLifetimeValueMinor).toBeGreaterThan(0);
    expect(s.segments.VIP).toBeGreaterThanOrEqual(1);
    expect(s.segments.LAPSED).toBeGreaterThanOrEqual(1);
    expect(s.repeatRatePct).toBeGreaterThan(0);
  });

  it('filters the list by segment', async () => {
    const vips = await commerce.customers.list(ctx, storeId, { segment: 'VIP' });
    expect(vips.every((r) => r.segment === 'VIP')).toBe(true);
    expect(vips.length).toBeGreaterThanOrEqual(1);
  });
});
