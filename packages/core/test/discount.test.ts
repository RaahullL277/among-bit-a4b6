import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { ValidationError, type TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('discount codes', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;
  let variantId: string;

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Discount Co' } });
    ctx = { tenantId: tenant.id };
    const store = await commerce.stores.create(ctx, { name: 'Deal Mart' });
    storeId = store.id;
    await commerce.integrations.configure(ctx, { storeId, provider: 'RAZORPAY', credentials: { webhookSecret: 's' } });
    const p = await commerce.products.create(ctx, { storeId, title: 'Widget', status: 'ACTIVE', variants: [{ priceMinor: 100000, inventory: 100 }] });
    variantId = p.variants[0].id;
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  async function cartWith(qty: number) {
    const cart = await commerce.carts.createCart(ctx, { storeId, items: [{ variantId, quantity: qty }] });
    return cart.id;
  }

  it('validates a percent code against the subtotal', async () => {
    await commerce.discounts.create(ctx, { storeId, code: 'welcome10', value: 10 });
    const v = await commerce.discounts.validate(storeId, 'WELCOME10', 200000);
    expect(v.valid).toBe(true);
    expect(v.discountMinor).toBe(20000); // 10% of ₹2000
    const bad = await commerce.discounts.validate(storeId, 'NOPE', 200000);
    expect(bad.valid).toBe(false);
  });

  it('applies a code at checkout and counts the redemption', async () => {
    const cartId = await cartWith(2); // subtotal ₹2000
    const res = await commerce.storefront.checkout(cartId, { email: 'b@example.com', discountCode: 'WELCOME10' });
    expect(res.order.discountMinor).toBe(20000);
    expect(res.order.totalMinor).toBe(180000); // 2000 - 200 discount

    const d = await prisma.discount.findFirst({ where: { storeId, code: 'WELCOME10' } });
    expect(d?.redeemedCount).toBe(1);
  });

  it('enforces minimum spend', async () => {
    await commerce.discounts.create(ctx, { storeId, code: 'BIG50', type: 'FIXED', value: 50000, minSpendMinor: 300000 });
    const below = await commerce.discounts.validate(storeId, 'BIG50', 100000);
    expect(below.valid).toBe(false);
    expect(below.reason).toBe('min_spend');
    const above = await commerce.discounts.validate(storeId, 'BIG50', 400000);
    expect(above.discountMinor).toBe(50000);
  });

  it('rejects an invalid code at checkout and honours the redemption cap', async () => {
    const cartId = await cartWith(1);
    await expect(commerce.storefront.checkout(cartId, { email: 'x@example.com', discountCode: 'GHOST' })).rejects.toBeInstanceOf(ValidationError);

    await commerce.discounts.create(ctx, { storeId, code: 'ONCE', value: 5, maxRedemptions: 1 });
    await prisma.discount.update({ where: { storeId_code: { storeId, code: 'ONCE' } }, data: { redeemedCount: 1 } });
    const v = await commerce.discounts.validate(storeId, 'ONCE', 100000);
    expect(v.valid).toBe(false);
    expect(v.reason).toBe('limit_reached');
  });
});
