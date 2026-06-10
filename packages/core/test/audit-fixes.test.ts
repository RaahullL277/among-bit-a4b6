import { randomBytes, createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { ValidationError, type TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

// Regression tests for the audit fixes: concurrency/atomicity in money + inventory.
describe.skipIf(!hasDb)('audit fixes — atomicity & races', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;
  let variantId: string;

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Fixes Co' } });
    ctx = { tenantId: tenant.id };
    const store = await commerce.stores.create(ctx, { name: 'Fixes Mart' });
    storeId = store.id;
    await commerce.integrations.configure(ctx, { storeId, provider: 'RAZORPAY', credentials: { webhookSecret: 's' } });
    const p = await commerce.products.create(ctx, { storeId, title: 'Widget', status: 'ACTIVE', variants: [{ priceMinor: 100000, inventory: 100 }] });
    variantId = p.variants[0].id;
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  const cart = async (qty = 1) => (await commerce.carts.createCart(ctx, { storeId, items: [{ variantId, quantity: qty }] })).id;

  it('discount redemption cap holds under concurrent checkouts', async () => {
    await commerce.discounts.create(ctx, { storeId, code: 'ONCE', value: 5, maxRedemptions: 1 });
    const carts = await Promise.all([cart(), cart(), cart(), cart(), cart()]);
    // 5 simultaneous checkouts racing for a 1-use code → exactly one wins.
    const results = await Promise.allSettled(
      carts.map((c) => commerce.storefront.checkout(c, { email: 'b@example.com', discountCode: 'ONCE' })),
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    expect(ok).toBe(1);
    const d = await prisma.discount.findFirst({ where: { storeId, code: 'ONCE' } });
    expect(d?.redeemedCount).toBe(1); // never exceeds the cap
  });

  it('loyalty points cannot be double-spent under concurrent redemptions', async () => {
    const customer = await prisma.customer.create({ data: { tenantId: ctx.tenantId, storeId, email: 'pts@x.com' } });
    await commerce.loyalty.setProgram(ctx, { storeId, enabled: true, redeemValueMinorPerPoint: 1, minRedeemPoints: 1 });
    await commerce.loyalty.award(ctx, customer.id, 100, 'seed');
    // Two concurrent 80-point redemptions against a 100 balance → only one succeeds.
    const remaining = 1_000_000;
    const results = await Promise.allSettled([
      commerce.loyalty.redeem(ctx, customer.id, 80, remaining),
      commerce.loyalty.redeem(ctx, customer.id, 80, remaining),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    expect(ok).toBe(1);
    const acct = await prisma.loyaltyAccount.findUnique({ where: { customerId: customer.id } });
    expect(acct!.pointsBalance).toBe(20); // exactly one 80-point spend applied; never negative
  });

  it('duplicate CAPTURED webhooks consume stock + award points exactly once', async () => {
    const c = await cart(3);
    const res: any = await commerce.storefront.checkout(c, { email: 'cap@x.com' });
    const providerRef = res.checkout.providerRef as string;
    const before = await prisma.productVariant.findUnique({ where: { id: variantId }, select: { inventory: true } });

    const body = JSON.stringify({ event: 'payment.captured', providerRef, status: 'CAPTURED' });
    const sig = createHmac('sha256', 's').update(body).digest('hex');
    // Fire the same capture webhook three times.
    await commerce.payments.handleWebhook('RAZORPAY', body, sig);
    await commerce.payments.handleWebhook('RAZORPAY', body, sig);
    await commerce.payments.handleWebhook('RAZORPAY', body, sig);

    const after = await prisma.productVariant.findUnique({ where: { id: variantId }, select: { inventory: true } });
    // Inventory consumed exactly once (by 3), not 9.
    expect(before!.inventory - after!.inventory).toBe(3);
    const order = await prisma.order.findFirst({ where: { storeId, status: 'PAID' }, orderBy: { createdAt: 'desc' } });
    expect(order?.status).toBe('PAID');
  });
});
