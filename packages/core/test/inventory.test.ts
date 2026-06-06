import { createHmac, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { ValidationError, type TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('inventory: consume on sale, guard, restore', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;
  let variantId: string;
  let customerId: string;

  async function inv() {
    return (await prisma.productVariant.findUnique({ where: { id: variantId }, select: { inventory: true } }))!.inventory;
  }
  async function setInv(n: number) {
    await prisma.productVariant.update({ where: { id: variantId }, data: { inventory: n } });
  }
  // Place an order via the cart→checkout path and capture it (→ PAID).
  async function buy(quantity: number, capture = true) {
    const cart = await commerce.storefront.createCart(storeId, { items: [{ variantId, quantity }] });
    const out: any = await commerce.carts.checkoutCart(ctx, cart.id);
    const order = out.order;
    await prisma.order.update({ where: { id: order.id }, data: { customerId } });
    if (capture) {
      const body = JSON.stringify({ providerRef: order.payment.providerRef, status: 'CAPTURED' });
      const sig = createHmac('sha256', 's').update(body).digest('hex');
      await commerce.payments.handleWebhook('RAZORPAY', body, sig);
    }
    return order;
  }

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Inv Co' } });
    ctx = { tenantId: tenant.id };
    const store = await commerce.stores.create(ctx, { name: 'Inv Store' });
    storeId = store.id;
    await commerce.integrations.configure(ctx, { storeId, provider: 'RAZORPAY', credentials: { webhookSecret: 's' } });
    const p = await commerce.products.create(ctx, { storeId, title: 'Widget', status: 'ACTIVE', variants: [{ priceMinor: 50000, inventory: 10 }] });
    variantId = p.variants[0].id;
    customerId = (await prisma.customer.create({ data: { tenantId: ctx.tenantId, storeId, email: 'b@ex.com', name: 'B' } })).id;
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('decrements stock when a sale is captured (and only once)', async () => {
    await setInv(10);
    const order = await buy(3);
    expect(await inv()).toBe(7);

    // A duplicate capture webhook must not double-decrement.
    const body = JSON.stringify({ providerRef: order.payment.providerRef, status: 'CAPTURED' });
    const sig = createHmac('sha256', 's').update(body).digest('hex');
    await commerce.payments.handleWebhook('RAZORPAY', body, sig);
    expect(await inv()).toBe(7);
  });

  it('blocks overselling at checkout (track inventory, no backorder)', async () => {
    await setInv(2);
    await expect(commerce.payments.checkout(ctx, { storeId, items: [{ variantId, quantity: 5 }] })).rejects.toBeInstanceOf(ValidationError);
    // A within-stock order still works.
    await expect(commerce.payments.checkout(ctx, { storeId, items: [{ variantId, quantity: 2 }] })).resolves.toBeTruthy();
  });

  it('allows overselling into backorder when the policy permits', async () => {
    await commerce.stock.setPolicy(ctx, { storeId, allowBackorder: true });
    await setInv(1);
    await buy(4); // 1 - 4
    expect(await inv()).toBe(-3); // backorder
    await commerce.stock.setPolicy(ctx, { storeId, allowBackorder: false });
  });

  it('does not consume or enforce stock when tracking is off', async () => {
    await commerce.stock.setPolicy(ctx, { storeId, trackInventory: false });
    await setInv(1);
    await buy(9); // would oversell, but tracking is off
    expect(await inv()).toBe(1); // untouched
    await commerce.stock.setPolicy(ctx, { storeId, trackInventory: true });
  });

  it('restocks when a return is received (but not damaged goods)', async () => {
    await setInv(10);
    const order = await buy(4);
    expect(await inv()).toBe(6);
    const ret: any = await commerce.returns.requestPublic(storeId, { orderNumber: order.number, email: 'b@ex.com', reason: 'NO_LONGER_NEEDED', items: [{ orderItemId: (await prisma.order.findUnique({ where: { id: order.id }, select: { items: true } }))!.items[0].id, quantity: 4 }] });
    await commerce.returns.approve(ctx, ret.id);
    await commerce.returns.markReceived(ctx, ret.id);
    expect(await inv()).toBe(10); // returned to stock

    // Damaged goods are not resaleable → no restock.
    const order2 = await buy(2);
    expect(await inv()).toBe(8);
    const ret2: any = await commerce.returns.requestPublic(storeId, { orderNumber: order2.number, email: 'b@ex.com', reason: 'DAMAGED' });
    await commerce.returns.approve(ctx, ret2.id);
    await commerce.returns.markReceived(ctx, ret2.id);
    expect(await inv()).toBe(8); // unchanged
  });

  it('restocks when a paid order is cancelled (buyer self-cancel + merchant cancel)', async () => {
    await setInv(10);
    const order = await buy(3);
    expect(await inv()).toBe(7);
    await commerce.returns.cancelOrderByCustomer(storeId, order.number, 'b@ex.com');
    expect(await inv()).toBe(10); // restored

    const order2 = await buy(2);
    expect(await inv()).toBe(8);
    await commerce.orders.updateStatus(ctx, order2.id, 'CANCELLED'); // merchant cancel
    expect(await inv()).toBe(10);
  });
});
