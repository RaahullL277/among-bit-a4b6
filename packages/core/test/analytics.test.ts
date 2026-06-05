import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import type { TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('analytics', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;
  let varA: string;
  let varB: string;

  // Create a paid order directly with given line items.
  let orderNo = 0;
  async function paidOrder(lines: { variantId: string; qty: number; price: number }[]) {
    const total = lines.reduce((s, l) => s + l.qty * l.price, 0);
    await prisma.order.create({
      data: {
        tenantId: ctx.tenantId,
        storeId,
        number: ++orderNo,
        status: 'PAID',
        totalMinor: total,
        items: {
          create: lines.map((l) => ({
            tenantId: ctx.tenantId,
            variantId: l.variantId,
            title: 'x',
            quantity: l.qty,
            unitPriceMinor: l.price,
          })),
        },
      },
    });
  }

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Analytics Test' } });
    ctx = { tenantId: tenant.id };
    const store = await commerce.stores.create(ctx, { name: 'Analytics Store' });
    storeId = store.id;
    const a = await commerce.products.create(ctx, { storeId, title: 'A', variants: [{ priceMinor: 10000 }] });
    const b = await commerce.products.create(ctx, { storeId, title: 'B', variants: [{ priceMinor: 50000 }] });
    varA = a.variants[0].id;
    varB = b.variants[0].id;

    // 3 paid orders. Product B outsells A by revenue.
    await paidOrder([{ variantId: varA, qty: 2, price: 10000 }]); // 200.00
    await paidOrder([{ variantId: varB, qty: 1, price: 50000 }]); // 500.00
    await paidOrder([{ variantId: varB, qty: 2, price: 50000 }]); // 1000.00
    // One unpaid order (should not count toward revenue).
    await prisma.order.create({
      data: { tenantId: ctx.tenantId, storeId, number: ++orderNo, status: 'PENDING', totalMinor: 99900 },
    });
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('summarizes revenue, paid orders, and AOV (excluding unpaid)', async () => {
    const s = await commerce.analytics.summary(ctx, { storeId });
    expect(s.paidOrders).toBe(3);
    expect(s.revenueMinor).toBe(170000); // 2000 + 5000 + 10000 paise
    expect(s.averageOrderValueMinor).toBe(Math.round(170000 / 3));
    expect(s.orders).toBe(4); // includes the pending one
  });

  it('builds a cart→checkout→paid funnel', async () => {
    const f = await commerce.analytics.funnel(ctx, { storeId });
    const byStage = Object.fromEntries(f.map((x) => [x.stage, x.count]));
    expect(byStage.Checkouts).toBe(4);
    expect(byStage.Paid).toBe(3);
  });

  it('ranks top products by revenue', async () => {
    const top = await commerce.analytics.topProducts(ctx, { storeId });
    expect(top[0].title).toBe('B');
    expect(top[0].revenueMinor).toBe(150000);
    expect(top[0].units).toBe(3);
  });

  it('returns a continuous revenue series summing to total revenue', async () => {
    const series = await commerce.analytics.revenueSeries(ctx, { storeId, interval: 'day' });
    expect(series.length).toBeGreaterThan(0);
    expect(series.reduce((sum, b) => sum + b.revenueMinor, 0)).toBe(170000);
  });
});
