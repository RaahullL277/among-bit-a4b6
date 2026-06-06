import { createHmac, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { ValidationError, type TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('loyalty / rewards', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;
  let variantId: string;

  async function paidOrder(customerId: string, qty = 1) {
    const { order } = await commerce.payments.checkout(ctx, { storeId, customerId, items: [{ variantId, quantity: qty }] });
    // Drive the captured-payment path so loyalty earn fires.
    await commerce.payments.handleWebhook(
      'RAZORPAY',
      JSON.stringify({ providerRef: order.payment.providerRef, status: 'CAPTURED' }),
      sign(order.payment.providerRef),
    );
    return order;
  }

  // The seeded RAZORPAY stub verifies an HMAC of the body with the webhookSecret.
  const SECRET = 'whsec';
  function sign(providerRef: string) {
    const body = JSON.stringify({ providerRef, status: 'CAPTURED' });
    return createHmac('sha256', SECRET).update(body).digest('hex');
  }

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Loyal Co' } });
    ctx = { tenantId: tenant.id };
    const store = await commerce.stores.create(ctx, { name: 'Loyal Store' });
    storeId = store.id;
    await commerce.integrations.configure(ctx, { storeId, provider: 'RAZORPAY', credentials: { webhookSecret: SECRET } });
    const product = await commerce.products.create(ctx, {
      storeId,
      title: 'Mug',
      status: 'ACTIVE',
      variants: [{ priceMinor: 50000, inventory: 100 }], // ₹500
    });
    variantId = product.variants[0].id;
    // 1 point per ₹1, 100 points = ₹10 (10 paise/point), min redeem 100, with tiers.
    await commerce.loyalty.setProgram(ctx, {
      storeId,
      enabled: true,
      pointsPerCurrencyUnit: 1,
      redeemValueMinorPerPoint: 10,
      minRedeemPoints: 100,
      tiers: [
        { name: 'Silver', minPoints: 300 },
        { name: 'Gold', minPoints: 1000 },
      ],
    });
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('awards points on a paid order and assigns a tier', async () => {
    const customer = await commerce.customers.create(ctx, { storeId, name: 'Ria', email: 'ria@example.com' });
    await paidOrder(customer.id); // ₹500 → 500 points
    const acc = await commerce.loyalty.account(ctx, customer.id);
    expect(acc.pointsBalance).toBe(500);
    expect(acc.lifetimePoints).toBe(500);
    expect(acc.tier).toBe('Silver'); // 500 >= 300
  });

  it('is idempotent — re-processing the same paid order does not double-award', async () => {
    const customer = await commerce.customers.create(ctx, { storeId, name: 'Ivo', email: 'ivo@example.com' });
    const order = await paidOrder(customer.id);
    // Earn again for the same order explicitly — should be a no-op.
    await commerce.loyalty.earnForOrder(ctx, order.id);
    const acc = await commerce.loyalty.account(ctx, customer.id);
    expect(acc.pointsBalance).toBe(500);
  });

  it('redeems points for a discount at checkout, capped at the order value', async () => {
    const customer = await commerce.customers.create(ctx, { storeId, name: 'Sam', email: 'sam@example.com' });
    await paidOrder(customer.id); // 500 points
    await paidOrder(customer.id); // +500 → 1000 points, Gold

    const before = await commerce.loyalty.account(ctx, customer.id);
    expect(before.pointsBalance).toBe(1000);
    expect(before.tier).toBe('Gold');

    // Redeem 200 points (= ₹20) on a ₹500 cart.
    const cart = await commerce.carts.createCart(ctx, { storeId, customerId: customer.id, items: [{ variantId, quantity: 1 }] });
    const { order } = await commerce.carts.checkoutCart(ctx, cart.id, { redeemPoints: 200 });
    expect(order.discountMinor).toBe(2000); // ₹20 off
    expect(order.totalMinor).toBe(48000);

    const after = await commerce.loyalty.account(ctx, customer.id);
    expect(after.pointsBalance).toBe(800);
  });

  it('enforces the minimum redemption and balance', async () => {
    const customer = await commerce.customers.create(ctx, { storeId, name: 'Lo', email: 'lo@example.com' });
    await commerce.loyalty.award(ctx, customer.id, 50, 'welcome', 'SIGNUP');
    // Below the 100-point minimum.
    await expect(commerce.loyalty.redeem(ctx, customer.id, 50)).rejects.toBeInstanceOf(ValidationError);
    // More than the balance.
    await expect(commerce.loyalty.redeem(ctx, customer.id, 100000)).rejects.toBeInstanceOf(ValidationError);
  });

  it('links a customer by email at checkout and exposes a public balance', async () => {
    const cart = await commerce.carts.createCart(ctx, { storeId, items: [{ variantId, quantity: 1 }] });
    await commerce.carts.checkoutCart(ctx, cart.id, { email: 'walkin@example.com' });
    const bal = await commerce.loyalty.publicBalance(storeId, 'WALKIN@example.com');
    expect(bal.enabled).toBe(true);
    expect(bal.found).toBe(true);
  });
});
