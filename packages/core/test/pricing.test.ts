import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { ValidationError, type TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('pricing intelligence', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;
  let variantId: string;

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Price Co' } });
    ctx = { tenantId: tenant.id };
    const store = await commerce.stores.create(ctx, { name: 'Price Store' });
    storeId = store.id;
    // Price ₹1000, cost ₹600 → 40% margin.
    const product = await commerce.products.create(ctx, {
      storeId,
      title: 'Widget',
      status: 'ACTIVE',
      variants: [{ priceMinor: 100000, costMinor: 60000, inventory: 10 }],
    });
    variantId = product.variants[0].id;
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('computes margin and market position from competitor prices', async () => {
    await commerce.pricing.addCompetitor(ctx, { variantId, competitorName: 'RivalA', priceMinor: 90000 });
    await commerce.pricing.addCompetitor(ctx, { variantId, competitorName: 'RivalB', priceMinor: 95000 });

    const a = await commerce.pricing.analyze(ctx, storeId);
    const item = a.items.find((i) => i.variantId === variantId)!;
    expect(item.marginPercent).toBe(40); // (100000-60000)/100000
    expect(item.lowestCompetitorMinor).toBe(90000);
    expect(item.position).toBe('expensive'); // we're above the highest competitor
  });

  it('recommends a beat-lowest price bounded by the margin floor', async () => {
    // Beat the lowest competitor by 5%, min margin 20%.
    await commerce.pricing.setRule(ctx, { storeId, enabled: true, strategy: 'BEAT_LOWEST', adjustValue: 5, adjustIsPercent: true, minMarginPercent: 20 });
    const a = await commerce.pricing.analyze(ctx, storeId);
    const item = a.items.find((i) => i.variantId === variantId)!;
    // 90000 - 5% = 85500; margin there = (85500-60000)/85500 ≈ 29.8% > 20% floor → allowed.
    expect(item.recommendedPriceMinor).toBe(85500);
    expect(item.recommendedMarginPercent).toBeGreaterThanOrEqual(20);
  });

  it('never recommends below the minimum-margin floor', async () => {
    // A competitor far below our cost; min margin 25% → floor = 60000/0.75 = 80000.
    await commerce.pricing.addCompetitor(ctx, { variantId, competitorName: 'Dumper', priceMinor: 50000 });
    await commerce.pricing.setRule(ctx, { storeId, strategy: 'MATCH_LOWEST', minMarginPercent: 25 });
    const a = await commerce.pricing.analyze(ctx, storeId);
    const item = a.items.find((i) => i.variantId === variantId)!;
    expect(item.recommendedPriceMinor).toBe(80000); // clamped to the margin floor, not 50000
  });

  it('applies repricing by writing the new variant prices', async () => {
    await commerce.pricing.setRule(ctx, { storeId, strategy: 'MATCH_LOWEST', minMarginPercent: 25 });
    const res = await commerce.pricing.reprice(ctx, storeId, { apply: true });
    expect(res.applied).toBe(true);
    expect(res.count).toBeGreaterThanOrEqual(1);
    const v = await prisma.productVariant.findUnique({ where: { id: variantId } });
    expect(v?.priceMinor).toBe(80000); // floor-clamped price was written
  });

  it('validates rule inputs and competitor data', async () => {
    await expect(commerce.pricing.setRule(ctx, { storeId, minMarginPercent: 150 })).rejects.toBeInstanceOf(ValidationError);
    await expect(commerce.pricing.addCompetitor(ctx, { variantId, competitorName: '', priceMinor: 100 })).rejects.toBeInstanceOf(ValidationError);
    await expect(commerce.pricing.addCompetitor(ctx, { variantId, competitorName: 'X', priceMinor: 0 })).rejects.toBeInstanceOf(ValidationError);
  });

  it('manages cost and competitor rows', async () => {
    await commerce.pricing.setCost(ctx, variantId, 65000);
    const list = await commerce.pricing.listCompetitors(ctx, variantId);
    expect(list.length).toBeGreaterThanOrEqual(3);
    const del = await commerce.pricing.removeCompetitor(ctx, list[0].id);
    expect(del.deleted).toBe(true);
  });
});
