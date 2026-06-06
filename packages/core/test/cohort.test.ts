import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { type TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);
const DAY = 86_400_000;

describe.skipIf(!hasDb)('cohort intelligence', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;
  const variants: string[] = [];
  const products: string[] = [];

  async function customer(email: string, source?: string, campaign?: string, term?: string) {
    return prisma.customer.create({ data: { tenantId: ctx.tenantId, storeId, email, acqSource: source, acqCampaign: campaign, acqTerm: term } });
  }
  async function event(customerId: string, type: any, productId?: string) {
    await prisma.behaviorEvent.create({ data: { tenantId: ctx.tenantId, storeId, customerId, type, productId } });
  }
  async function paidOrder(customerId: string, variantId: string, amount: number, daysAgo = 1) {
    const last = await prisma.order.aggregate({ where: { storeId }, _max: { number: true } });
    await prisma.order.create({
      data: {
        tenantId: ctx.tenantId, storeId, number: (last._max.number ?? 0) + 1, customerId, status: 'PAID', totalMinor: amount,
        createdAt: new Date(Date.now() - daysAgo * DAY),
        items: { create: [{ tenantId: ctx.tenantId, variantId, title: 'X', quantity: 1, unitPriceMinor: amount }] },
      },
    });
  }

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Cohort Co' } });
    ctx = { tenantId: tenant.id };
    const store = await commerce.stores.create(ctx, { name: 'Cohort Store' });
    storeId = store.id;
    for (let i = 0; i < 4; i++) {
      const p = await commerce.products.create(ctx, { storeId, title: `P${i}`, status: 'ACTIVE', variants: [{ priceMinor: 50000 + i * 10000 }] });
      products.push(p.id);
      variants.push(p.variants[0].id);
    }

    // ~12 customers across acquisition channels with varied behaviour.
    // Meta "Summer Sale" high-value buyers (buy P0 + P1).
    for (let i = 0; i < 4; i++) {
      const c = await customer(`meta-buyer-${i}@ex.com`, 'meta', 'Summer Sale');
      await event(c.id, 'VIEW', products[0]); await event(c.id, 'ADD_TO_CART', products[0]);
      await paidOrder(c.id, variants[0], 400000, i === 0 ? 5 : 200); // one HOT, others COLD
      await paidOrder(c.id, variants[1], 300000, 200);
    }
    // Google "running shoes" browsers/cart-abandoners (view P2/P3, buy P2 sometimes).
    for (let i = 0; i < 4; i++) {
      const c = await customer(`google-${i}@ex.com`, 'google', undefined, 'running shoes');
      await event(c.id, 'VIEW', products[2]); await event(c.id, 'VIEW', products[3]); await event(c.id, 'ADD_TO_CART', products[2]);
      if (i < 2) await paidOrder(c.id, variants[2], 60000, 10); // recent → HOT/WARM
    }
    // Direct low-engagement visitors.
    for (let i = 0; i < 4; i++) {
      const c = await customer(`direct-${i}@ex.com`, 'direct');
      await event(c.id, 'VIEW', products[i % 4]);
    }
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('classifies temperature by purchase recency', () => {
    expect(commerce.cohorts.temperatureFor(new Date(Date.now() - 5 * DAY))).toBe('HOT');
    expect(commerce.cohorts.temperatureFor(new Date(Date.now() - 60 * DAY))).toBe('WARM');
    expect(commerce.cohorts.temperatureFor(new Date(Date.now() - 200 * DAY))).toBe('COLD');
    expect(commerce.cohorts.temperatureFor(null)).toBe('COLD');
  });

  it('recomputes behavioural + acquisition cohorts', async () => {
    const res = await commerce.cohorts.recompute(ctx, storeId);
    expect(res.customers).toBe(12);
    expect(res.behavioral).toBeGreaterThanOrEqual(2); // fuzzy c-means micro-cohorts
    expect(res.acquisition).toBeGreaterThanOrEqual(2); // Meta Summer Sale + Google "running shoes"

    const list = await commerce.cohorts.list(ctx, storeId);
    const labels = list.map((c) => c.label);
    expect(labels.some((l) => l.includes('Meta · Summer Sale'))).toBe(true);
    expect(labels.some((l) => l.includes('Google · "running shoes"'))).toBe(true);
  });

  it('places a customer in multiple cohorts with a temperature', async () => {
    const meta = await prisma.customer.findFirst({ where: { storeId, email: 'meta-buyer-0@ex.com' } });
    const info = await commerce.cohorts.forCustomer(ctx, meta!.id);
    // At least a behavioural cohort + the Meta acquisition cohort.
    expect(info.cohorts.length).toBeGreaterThanOrEqual(2);
    expect(info.cohorts.some((c) => c.kind === 'ACQUISITION')).toBe(true);
    expect(info.cohorts.some((c) => c.kind === 'BEHAVIORAL')).toBe(true);
    expect(info.temperature).toBe('HOT'); // bought 5 days ago
    expect(info.acquisition.source).toBe('meta');
  });

  it('recommends what cohort peers bought (excluding owned)', async () => {
    // A Meta buyer who only bought P0 should be recommended P1 (peers bought it).
    const target = await customer('meta-newbuyer@ex.com', 'meta', 'Summer Sale');
    await paidOrder(target.id, variants[0], 400000, 3);
    await commerce.cohorts.recompute(ctx, storeId);
    const recs = await commerce.cohorts.recommendations(ctx, target.id);
    const ids = recs.recommendations.map((r: any) => r.productId);
    expect(ids).toContain(products[1]); // peers in the Meta cohort bought P1
    expect(ids).not.toContain(products[0]); // already owned → excluded
  });

  it('tracks events with attribution and stitches anonymous → identified', async () => {
    const anon = 'sess_' + randomBytes(4).toString('hex');
    await commerce.cohorts.track({ storeId, type: 'LAND', anonymousId: anon, source: 'facebook', campaign: 'Diwali' });
    await commerce.cohorts.track({ storeId, type: 'VIEW', anonymousId: anon, productId: products[0] });
    // Identify: creates the customer, sets first-touch attribution, and stitches.
    const r = await commerce.cohorts.track({ storeId, type: 'ADD_TO_CART', anonymousId: anon, email: 'stitched@ex.com', productId: products[0] });
    expect(r.customerId).toBeTruthy();
    const c = await prisma.customer.findUnique({ where: { id: r.customerId! } });
    expect(c?.acqSource).toBe('meta'); // facebook normalized → meta
    const stitched = await prisma.behaviorEvent.count({ where: { anonymousId: anon, customerId: r.customerId } });
    expect(stitched).toBe(3); // land + view + add, all linked
  });
});
