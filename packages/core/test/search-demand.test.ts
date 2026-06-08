import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import type { TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('search demand & unmet-demand analytics', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Demand Co' } });
    ctx = { tenantId: tenant.id };
    const store = await commerce.stores.create(ctx, { name: 'Demand Mart' });
    storeId = store.id;

    // Two shoppers search for something we stock (results) and something we don't (0).
    await commerce.cohorts.track({ storeId, type: 'SEARCH', anonymousId: 'a1', query: 'Yoga Mat', resultCount: 3 });
    await commerce.cohorts.track({ storeId, type: 'SEARCH', anonymousId: 'a2', query: 'yoga mat', resultCount: 3 });
    await commerce.cohorts.track({ storeId, type: 'SEARCH', anonymousId: 'a1', query: 'Resistance Bands', resultCount: 0 });
    await commerce.cohorts.track({ storeId, type: 'SEARCH', anonymousId: 'a2', query: 'resistance bands', resultCount: 0 });
    await commerce.cohorts.track({ storeId, type: 'SEARCH', anonymousId: 'a3', query: 'foam roller', resultCount: 0 });
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('aggregates searches and surfaces unmet demand (zero-result terms)', async () => {
    const ins = await commerce.analytics.searchInsights(ctx, { storeId });
    expect(ins.totalSearches).toBe(5);
    // Case-insensitive grouping: "Yoga Mat"/"yoga mat" → one term.
    expect(ins.uniqueTerms).toBe(3);
    expect(ins.noResultSearches).toBe(3);

    const top = ins.topSearches.map((t) => t.query);
    expect(top).toContain('yoga mat');

    const unmet = ins.unmetDemand.map((t) => t.query);
    expect(unmet).toContain('resistance bands'); // 2 shoppers, 0 results
    expect(unmet).toContain('foam roller');
    expect(unmet).not.toContain('yoga mat');     // it had results
    // Ranked by volume: resistance bands (2) before foam roller (1).
    expect(ins.unmetDemand[0].query).toBe('resistance bands');
    expect(ins.unmetDemand[0].noResultShare).toBe(1);
  });

  it('the advisor surfaces unmet demand as an opportunity with a create_product action', async () => {
    const advisory = await commerce.advisor.evaluate(ctx, storeId);
    const rec = advisory.recommendations.find((r) => r.code === 'DEMAND_UNMET_SEARCH')!;
    expect(rec).toBeTruthy();
    expect(rec.category).toBe('demand');
    expect(rec.severity).toBe('opportunity');
    expect(rec.action?.tool).toBe('create_product');
    expect(rec.action?.args).toMatchObject({ storeId, title: 'resistance bands' });
  });
});
