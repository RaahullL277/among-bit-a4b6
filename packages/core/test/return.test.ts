import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { ValidationError, type TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('returns / RMA', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;
  let variantId: string;

  // Create a paid (CAPTURED) order and return its id + first order-item id.
  async function paidOrder(email = 'buyer@example.com') {
    const customer = await commerce.customers.create(ctx, { storeId, name: 'Buyer', email });
    const { order } = await commerce.payments.checkout(ctx, {
      storeId,
      customerId: customer.id,
      items: [{ variantId, quantity: 2 }],
    });
    // Simulate a captured payment without going through the webhook.
    await prisma.payment.update({ where: { orderId: order.id }, data: { status: 'CAPTURED' } });
    await prisma.order.update({ where: { id: order.id }, data: { status: 'PAID' } });
    const items = await prisma.orderItem.findMany({ where: { orderId: order.id } });
    return { order, orderItemId: items[0].id };
  }

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Return Co' } });
    ctx = { tenantId: tenant.id };
    const store = await commerce.stores.create(ctx, { name: 'Return Store' });
    storeId = store.id;
    await commerce.integrations.configure(ctx, { storeId, provider: 'RAZORPAY', credentials: { webhookSecret: 's' } });
    const product = await commerce.products.create(ctx, {
      storeId,
      title: 'Headphones',
      status: 'ACTIVE',
      variants: [{ priceMinor: 300000, inventory: 50 }],
    });
    variantId = product.variants[0].id;
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('rejects a return for an unpaid order', async () => {
    const { order } = await commerce.payments.checkout(ctx, { storeId, items: [{ variantId, quantity: 1 }] });
    await expect(commerce.returns.request(ctx, { orderId: order.id })).rejects.toBeInstanceOf(ValidationError);
  });

  it('creates a return (whole order) with a sequential number and computed refund', async () => {
    const { order } = await paidOrder();
    const ret = await commerce.returns.request(ctx, {
      orderId: order.id,
      reason: 'DAMAGED',
      comment: 'Arrived cracked',
      evidenceVideoUrl: 'https://videos.example/unbox.mp4',
    });
    expect(ret.status).toBe('REQUESTED');
    expect(ret.number).toBeGreaterThanOrEqual(1);
    // 2 units * 300000 = 600000.
    expect(ret.refundMinor).toBe(600000);
    expect(ret.evidenceVideoUrl).toContain('unbox.mp4');
    expect(ret.items).toHaveLength(1);
  });

  it('validates item selection and quantity', async () => {
    const { order, orderItemId } = await paidOrder('q@example.com');
    await expect(
      commerce.returns.request(ctx, { orderId: order.id, items: [{ orderItemId, quantity: 5 }] }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      commerce.returns.request(ctx, { orderId: order.id, items: [{ orderItemId: 'nope', quantity: 1 }] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('enforces the status transition graph', async () => {
    const { order } = await paidOrder('t@example.com');
    const ret = await commerce.returns.request(ctx, { orderId: order.id });
    // Cannot receive before approval.
    await expect(commerce.returns.markReceived(ctx, ret.id)).rejects.toBeInstanceOf(ValidationError);
    await commerce.returns.approve(ctx, ret.id, 'Approved, send it back');
    const rejected = commerce.returns.reject(ctx, ret.id);
    await expect(rejected).rejects.toBeInstanceOf(ValidationError); // already approved
  });

  it('refunds an approved return through the payment adapter', async () => {
    const { order } = await paidOrder('r@example.com');
    const ret = await commerce.returns.request(ctx, { orderId: order.id });
    await commerce.returns.approve(ctx, ret.id);
    const refunded = await commerce.returns.refund(ctx, ret.id);
    expect(refunded.status).toBe('REFUNDED');
    expect(refunded.refundRef).toMatch(/^rfnd_/);

    // Order + payment flipped to REFUNDED on a full refund.
    const o = await prisma.order.findUnique({ where: { id: order.id }, include: { payment: true } });
    expect(o?.status).toBe('REFUNDED');
    expect(o?.payment?.status).toBe('REFUNDED');
  });

  it('supports the public (order# + email) request path and counts', async () => {
    const { order } = await paidOrder('public@example.com');
    const res = await commerce.returns.requestPublic(storeId, {
      orderNumber: order.number,
      email: 'PUBLIC@example.com', // case-insensitive
      reason: 'WRONG_ITEM',
    });
    expect(res.status).toBe('REQUESTED');

    // Wrong email is rejected.
    await expect(
      commerce.returns.requestPublic(storeId, { orderNumber: order.number, email: 'nope@example.com' }),
    ).rejects.toBeTruthy();

    const counts = await commerce.returns.counts(ctx, storeId);
    expect(counts.REQUESTED + counts.APPROVED + counts.REFUNDED + counts.REJECTED).toBeGreaterThanOrEqual(3);
  });
});
