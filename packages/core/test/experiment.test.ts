import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import type { TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('storefront experiments', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Exp Co' } });
    ctx = { tenantId: tenant.id };
    const store = await commerce.stores.create(ctx, { name: 'Exp Mart' });
    storeId = store.id;
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('SPLIT assignment is deterministic, sticky, and splits a sample', async () => {
    const exp = await commerce.experiments.create(ctx, { storeId, name: 'Hero test', mode: 'SPLIT', variants: [{ name: 'B', weight: 50 }] });
    await commerce.experiments.setStatus(ctx, exp.id, 'RUNNING');

    const r1 = await commerce.experiments.resolveExperience(storeId, 'home', { anonymousId: 'visitor-1' });
    const r2 = await commerce.experiments.resolveExperience(storeId, 'home', { anonymousId: 'visitor-1' });
    expect(r1).toBeTruthy();
    expect(r1!.experiment.variantId).toBe(r2!.experiment.variantId); // sticky

    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const r = await commerce.experiments.resolveExperience(storeId, 'home', { anonymousId: `v${i}` });
      seen.add(r!.experiment.variantId);
    }
    expect(seen.size).toBe(2); // both variants get traffic

    await commerce.experiments.setStatus(ctx, exp.id, 'ENDED');
  });

  it('returns null when no experiment is running (storefront falls back)', async () => {
    const r = await commerce.experiments.resolveExperience(storeId, 'home', { anonymousId: 'x' });
    expect(r).toBeNull();
  });

  it('TARGETED resolves cohort-first, then UTM, then control', async () => {
    const exp = await commerce.experiments.create(ctx, {
      storeId, name: 'Audience test', slug: 'audience', mode: 'TARGETED',
      variants: [
        { name: 'Premium', audienceKind: 'COHORT', audienceValue: 'premium', priority: 10 },
        { name: 'Diwali', audienceKind: 'ACQUISITION_SOURCE', audienceValue: 'meta', priority: 5 },
      ],
    });
    await commerce.experiments.setStatus(ctx, exp.id, 'RUNNING');
    const variantByName = (n: string) => exp.variants.find((v) => v.name === n)!.id;

    // A customer in the "premium" cohort.
    const customer = await prisma.customer.create({ data: { tenantId: ctx.tenantId, storeId, email: 'vip@x.com' } });
    const cohort = await prisma.cohort.create({ data: { tenantId: ctx.tenantId, storeId, kind: 'BEHAVIORAL', key: 'premium', label: 'Premium' } });
    await prisma.cohortMembership.create({ data: { tenantId: ctx.tenantId, cohortId: cohort.id, customerId: customer.id, weight: 1 } });

    const known = await commerce.experiments.resolveExperience(storeId, 'audience', { customerId: customer.id, anonymousId: 'k' });
    expect(known!.experiment.variantId).toBe(variantByName('Premium')); // cohort wins

    const utm = await commerce.experiments.resolveExperience(storeId, 'audience', { anonymousId: 'anon', acquisition: { source: 'meta' } });
    expect(utm!.experiment.variantId).toBe(variantByName('Diwali')); // UTM for anon

    const plain = await commerce.experiments.resolveExperience(storeId, 'audience', { anonymousId: 'anon2' });
    expect(plain!.experiment.isControl).toBe(true); // fallback to control

    await commerce.experiments.setStatus(ctx, exp.id, 'ENDED');
  });

  it('computes the funnel, auto-picks the deepest powered metric, flags a winner, and promotes', async () => {
    const exp = await commerce.experiments.create(ctx, { storeId, name: 'Conversion test', slug: 'promo', mode: 'SPLIT', variants: [{ name: 'B', weight: 50 }] });
    const control = exp.variants.find((v) => v.isControl)!.id;
    const b = exp.variants.find((v) => !v.isControl)!.id;

    // Seed exposures + paid orders: B converts much better than control.
    const expose = (variantId: string, who: string) =>
      prisma.behaviorEvent.create({ data: { tenantId: ctx.tenantId, storeId, type: 'VIEW', anonymousId: who, experimentId: exp.id, experimentVariantId: variantId } });
    const order = (variantId: string, n: number) =>
      prisma.order.create({ data: { tenantId: ctx.tenantId, storeId, number: n, status: 'PAID', totalMinor: 100000, experimentId: exp.id, experimentVariantId: variantId } });

    for (let i = 0; i < 100; i++) await expose(control, `c${i}`);
    for (let i = 0; i < 100; i++) await expose(b, `b${i}`);
    for (let i = 0; i < 3; i++) await order(control, 5000 + i);   // 3% conversion
    for (let i = 0; i < 20; i++) await order(b, 6000 + i);        // 20% conversion

    const res = await commerce.experiments.results(ctx, exp.id, { minConversions: 3 });
    expect(res.primaryMetric).toBe('paidConversion');
    const bRow = res.variants.find((v) => v.variantId === b)!;
    expect(bRow.exposures).toBe(100);
    expect(bRow.paidOrders).toBe(20);
    expect(bRow.significant).toBe(true);
    expect(res.winnerVariantId).toBe(b);

    const promoted = await commerce.experiments.promoteWinner(ctx, exp.id, b);
    expect(promoted.promoted).toBe(b);
    const after = await commerce.experiments.get(ctx, exp.id);
    expect(after.status).toBe('ENDED');
    expect(after.winningVariantId).toBe(b);
  });
});
