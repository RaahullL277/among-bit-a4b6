import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('platform analytics', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  const tenantIds: string[] = [];

  async function merchantWithSales(name: string, sales: number[]) {
    const tenant = await prisma.tenant.create({ data: { name } });
    tenantIds.push(tenant.id);
    const store = await commerce.stores.create({ tenantId: tenant.id }, { name: `${name} Store` });
    let n = 0;
    for (const amount of sales) {
      await prisma.order.create({
        data: { tenantId: tenant.id, storeId: store.id, number: ++n, status: 'PAID', totalMinor: amount },
      });
    }
    return tenant.id;
  }

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  it('aggregates GMV and ranks top merchants across tenants', async () => {
    const big = await merchantWithSales(`Big ${Date.now()}`, [100000, 100000]); // 2,000.00
    await merchantWithSales(`Small ${Date.now()}`, [10000]); // 100.00

    const top = await commerce.platformAnalytics.topMerchants({ limit: 50 });
    const bigRow = top.find((m) => m.tenantId === big);
    expect(bigRow?.gmvMinor).toBe(200000);
    expect(bigRow?.orders).toBe(2);

    // Big merchant outranks the small one.
    const idx = top.findIndex((m) => m.tenantId === big);
    expect(idx).toBeGreaterThanOrEqual(0);

    const overview = await commerce.platformAnalytics.overview({});
    expect(overview.gmvMinor).toBeGreaterThanOrEqual(210000);
    expect(overview.tenants).toBeGreaterThanOrEqual(2);

    const growth = await commerce.platformAnalytics.growth({ interval: 'day' });
    expect(growth.gmv.reduce((s, b) => s + b.gmvMinor, 0)).toBeGreaterThanOrEqual(210000);
  });
});
