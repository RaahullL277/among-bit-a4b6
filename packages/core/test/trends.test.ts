import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { StubMarketTrendsAdapter } from '../src/index.js';
import type { TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);
const DAY = 86_400_000;

describe('market-trends stub adapter', () => {
  it('returns deterministic, clearly-flagged sample data over the keywords', async () => {
    const a = new StubMarketTrendsAdapter();
    const r1 = await a.categoryTrends({ category: 'perfumes', keywords: ['attar', 'gift sets', 'eau de parfum'] });
    const r2 = await a.categoryTrends({ category: 'perfumes', keywords: ['attar', 'gift sets', 'eau de parfum'] });
    expect(r1.sample).toBe(true);
    expect(r1.source).toBe('sample');
    expect(r1.trends.map((t) => `${t.term}:${t.changePercent}`)).toEqual(r2.trends.map((t) => `${t.term}:${t.changePercent}`));
    expect(r1.trends.length).toBe(3);
    // Sorted by change desc.
    for (let i = 1; i < r1.trends.length; i++) expect(r1.trends[i - 1].changePercent).toBeGreaterThanOrEqual(r1.trends[i].changePercent);
  });
});

describe.skipIf(!hasDb)('store trends (internal momentum)', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Trend Co' } });
    ctx = { tenantId: tenant.id };
    const store = await commerce.stores.create(ctx, { name: 'Trend Mart' });
    storeId = store.id;

    // "wireless earbuds" searched more this window (3) than last (1) → rising.
    const mk = (q: string, when: Date, resultCount: number) =>
      prisma.behaviorEvent.create({ data: { tenantId: ctx.tenantId, storeId, type: 'SEARCH', anonymousId: 'x', query: q, resultCount, createdAt: when } });
    const now = new Date();
    const thisWin = new Date(now.getTime() - 2 * DAY);
    const lastWin = new Date(now.getTime() - 40 * DAY);
    await mk('wireless earbuds', thisWin, 0);
    await mk('wireless earbuds', thisWin, 0);
    await mk('wireless earbuds', thisWin, 0);
    await mk('wireless earbuds', lastWin, 0);
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('flags a rising (and unmet) search term', async () => {
    const t = await commerce.trends.storeTrends(ctx, { storeId, windowDays: 30 });
    const rising = t.risingSearches.find((s) => s.query === 'wireless earbuds')!;
    expect(rising).toBeTruthy();
    expect(rising.now).toBe(3);
    expect(rising.prev).toBe(1);
    expect(rising.delta).toBe(2);
    expect(rising.unmet).toBe(true);
  });

  it('market trends are seeded from the store and flagged as sample', async () => {
    const m = await commerce.trends.marketTrends(ctx, { storeId });
    expect(m.sample).toBe(true);
    expect(Array.isArray(m.trends)).toBe(true);
    expect(m.basedOn).toBeTruthy();
  });
});
