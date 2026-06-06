import { createHmac, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { ValidationError, type TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('payments — partial refunds & cumulative cap', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;
  let variantId: string;

  async function paidOrder(amountQty: number) {
    const cart = await commerce.storefront.createCart(storeId, { items: [{ variantId, quantity: amountQty }] });
    const out: any = await commerce.carts.checkoutCart(ctx, cart.id);
    const order = out.order;
    const body = JSON.stringify({ providerRef: order.payment.providerRef, status: 'CAPTURED' });
    await commerce.payments.handleWebhook('RAZORPAY', body, createHmac('sha256', 's').update(body).digest('hex'));
    return order;
  }

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Pay Co' } });
    ctx = { tenantId: tenant.id };
    storeId = (await commerce.stores.create(ctx, { name: 'Pay Store' })).id;
    await commerce.integrations.configure(ctx, { storeId, provider: 'RAZORPAY', credentials: { webhookSecret: 's' } });
    const p = await commerce.products.create(ctx, { storeId, title: 'Item', status: 'ACTIVE', variants: [{ priceMinor: 10000, inventory: 1000 }] });
    variantId = p.variants[0].id;
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('caps cumulative refunds at the order total and tracks partial state', async () => {
    const order = await paidOrder(5); // total 50000
    const r1 = await commerce.payments.refund(ctx, order.id, 20000);
    expect(r1).toMatchObject({ full: false, refundedMinor: 20000 });
    let pay = await prisma.payment.findUnique({ where: { orderId: order.id } });
    expect(pay!.status).toBe('PARTIALLY_REFUNDED');
    expect(pay!.refundedMinor).toBe(20000);
    expect((await prisma.order.findUnique({ where: { id: order.id } }))!.status).toBe('PAID'); // not fully refunded

    // A second partial that would exceed the remaining (30000) is rejected.
    await expect(commerce.payments.refund(ctx, order.id, 40000)).rejects.toBeInstanceOf(ValidationError);

    // Refunding the exact remainder completes it.
    const r2 = await commerce.payments.refund(ctx, order.id, 30000);
    expect(r2.full).toBe(true);
    pay = await prisma.payment.findUnique({ where: { orderId: order.id } });
    expect(pay!.status).toBe('REFUNDED');
    expect(pay!.refundedMinor).toBe(50000);
    expect((await prisma.order.findUnique({ where: { id: order.id } }))!.status).toBe('REFUNDED');

    // No further refunds once fully refunded.
    await expect(commerce.payments.refund(ctx, order.id, 1)).rejects.toBeInstanceOf(ValidationError);
  });
});
