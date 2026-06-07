import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import type { TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('store operations advisor', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Advisor Co' } });
    ctx = { tenantId: tenant.id };
    const store = await commerce.stores.create(ctx, { name: 'Advisor Mart' });
    storeId = store.id;
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  const codes = (a: { recommendations: { code: string }[] }) => a.recommendations.map((r) => r.code);

  it('flags launch-readiness gaps on an empty store', async () => {
    const a = await commerce.advisor.evaluate(ctx, storeId);
    expect(codes(a)).toContain('READINESS_NO_PAYMENT');
    expect(codes(a)).toContain('READINESS_NO_PRODUCTS');

    const pay = a.recommendations.find((r) => r.code === 'READINESS_NO_PAYMENT')!;
    expect(pay.severity).toBe('critical');
    expect(pay.action?.tool).toBe('configure_payment_provider');
    expect(pay.action?.args).toMatchObject({ storeId });

    expect(a.counts.critical).toBeGreaterThanOrEqual(2);
    expect(a.health.grade).toBe('D'); // nothing configured yet
    // Critical items sort first.
    expect(a.recommendations[0].severity).toBe('critical');
  });

  it('detects out-of-stock + fulfillment SLA, and is deterministic', async () => {
    // An active product with a priced, zero-inventory variant.
    const product = await commerce.products.create(ctx, {
      storeId, title: 'Sold Out Widget', status: 'ACTIVE',
      variants: [{ priceMinor: 50000, inventory: 0, sku: 'SO-1' }],
    });
    const variantId = product.variants[0].id;

    // A paid, unshipped order containing that variant, aged past the SLA.
    const order = await prisma.order.create({
      data: {
        tenantId: ctx.tenantId, storeId, number: 9001, status: 'PAID', totalMinor: 50000,
        items: { create: [{ tenantId: ctx.tenantId, variantId, title: 'Sold Out Widget', quantity: 1, unitPriceMinor: 50000 }] },
      },
    });
    const old = new Date(Date.now() - 5 * 24 * 3_600_000);
    await prisma.$executeRaw`UPDATE "Order" SET "updatedAt" = ${old}, "createdAt" = ${old} WHERE "id" = ${order.id}`;

    const a = await commerce.advisor.evaluate(ctx, storeId);
    expect(codes(a)).not.toContain('READINESS_NO_PRODUCTS'); // now has an active product

    const oos = a.recommendations.find((r) => r.code === 'INVENTORY_OUT_OF_STOCK')!;
    expect(oos).toBeTruthy();
    expect(oos.severity).toBe('critical'); // it's in an open order
    expect(oos.action?.tool).toBe('receive_stock');
    expect(oos.action?.args).toMatchObject({ variantId });

    const sla = a.recommendations.find((r) => r.code === 'FULFILLMENT_SLA_BREACH')!;
    expect(sla).toBeTruthy();
    expect(sla.action?.tool).toBe('create_shipment');
    expect(sla.action?.args).toMatchObject({ orderId: order.id });

    // Deterministic: identical state → identical recommendations (ignoring timestamp).
    const b = await commerce.advisor.evaluate(ctx, storeId);
    expect(JSON.stringify(b.recommendations)).toBe(JSON.stringify(a.recommendations));
    expect(b.health.score).toBe(a.health.score);
  });

  it('drops the payment-readiness flag once a provider is configured', async () => {
    await commerce.integrations.configure(ctx, { storeId, provider: 'RAZORPAY', credentials: { keyId: 'k', keySecret: 's', webhookSecret: 'w' } });
    const a = await commerce.advisor.evaluate(ctx, storeId);
    expect(codes(a)).not.toContain('READINESS_NO_PAYMENT');
    expect(a.health.readiness).toBeGreaterThan(0);
  });
});
