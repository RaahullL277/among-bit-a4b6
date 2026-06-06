import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { ValidationError, type TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);
const DAY = 86_400_000;
const HOUR = 3_600_000;

describe.skipIf(!hasDb)('return & cancellation policy', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;
  let variantId: string;
  let n = 1000;

  async function order(opts: { status: any; ageDays?: number; paid?: boolean; shipped?: boolean }) {
    const o = await prisma.order.create({
      data: {
        tenantId: ctx.tenantId, storeId, number: n++, status: opts.status, totalMinor: 50000,
        createdAt: new Date(Date.now() - (opts.ageDays ?? 0) * DAY),
        customerId: customerId,
        items: { create: [{ tenantId: ctx.tenantId, variantId, title: 'Item', quantity: 1, unitPriceMinor: 50000 }] },
      },
    });
    if (opts.paid) {
      await prisma.payment.create({ data: { tenantId: ctx.tenantId, orderId: o.id, provider: 'RAZORPAY', providerRef: 'pay_x', status: 'CAPTURED', amountMinor: 50000 } });
    }
    if (opts.shipped) {
      await prisma.shipment.create({ data: { tenantId: ctx.tenantId, storeId, orderId: o.id, provider: 'DELHIVERY', status: 'IN_TRANSIT', toAddress: { city: 'X' } } });
    }
    return o;
  }
  let customerId: string;

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Policy Co' } });
    ctx = { tenantId: tenant.id };
    const store = await commerce.stores.create(ctx, { name: 'Policy Store' });
    storeId = store.id;
    await commerce.integrations.configure(ctx, { storeId, provider: 'RAZORPAY', credentials: { webhookSecret: 's' } });
    const p = await commerce.products.create(ctx, { storeId, title: 'Item', status: 'ACTIVE', variants: [{ priceMinor: 50000, inventory: 9 }] });
    variantId = p.variants[0].id;
    customerId = (await prisma.customer.create({ data: { tenantId: ctx.tenantId, storeId, email: 'buyer@ex.com', name: 'Buyer' } })).id;
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('returns default policy and persists overrides', async () => {
    const def = await commerce.returns.getPolicy(ctx, storeId);
    expect(def.returnWindowDays).toBe(30);
    expect(def.isDefault).toBe(true);

    const saved = await commerce.returns.setPolicy(ctx, { storeId, returnWindowDays: 7, restockingFeePercent: 10, eligibleReasons: ['DAMAGED', 'WRONG_ITEM'], cancelWindowHours: 2 });
    expect(saved.returnWindowDays).toBe(7);
    expect(saved.restockingFeePercent).toBe(10);
    const pub = await commerce.returns.publicPolicy(storeId);
    expect(pub.eligibleReasons).toEqual(['DAMAGED', 'WRONG_ITEM']);
  });

  it('enforces the return window and eligible reasons, and applies the restocking fee', async () => {
    // Policy: 7-day window, 10% restocking, only DAMAGED/WRONG_ITEM.
    const old = await order({ status: 'PAID', ageDays: 10 });
    await expect(commerce.returns.requestPublic(storeId, { orderNumber: old.number, email: 'buyer@ex.com', reason: 'DAMAGED' }))
      .rejects.toBeInstanceOf(ValidationError); // window closed

    const fresh = await order({ status: 'PAID', ageDays: 1, paid: true });
    await expect(commerce.returns.requestPublic(storeId, { orderNumber: fresh.number, email: 'buyer@ex.com', reason: 'NO_LONGER_NEEDED' }))
      .rejects.toBeInstanceOf(ValidationError); // reason not eligible

    const ret: any = await commerce.returns.requestPublic(storeId, { orderNumber: fresh.number, email: 'buyer@ex.com', reason: 'DAMAGED' });
    await commerce.returns.approve(ctx, ret.id);
    const refunded = await commerce.returns.refund(ctx, ret.id);
    expect(refunded.refundMinor).toBe(45000); // 50000 minus 10% restocking fee
  });

  it('auto-approves in-policy requests when configured', async () => {
    await commerce.returns.setPolicy(ctx, { storeId, autoApprove: true, returnWindowDays: 30, eligibleReasons: ['DAMAGED', 'WRONG_ITEM', 'NOT_AS_DESCRIBED', 'NO_LONGER_NEEDED', 'OTHER'] });
    const o = await order({ status: 'PAID', ageDays: 1 });
    const ret: any = await commerce.returns.requestPublic(storeId, { orderNumber: o.number, email: 'buyer@ex.com', reason: 'DAMAGED' });
    expect(ret.status).toBe('APPROVED');
  });

  it('lets a buyer self-cancel within policy, refunding a paid order', async () => {
    await commerce.returns.setPolicy(ctx, { storeId, cancelEnabled: true, cancelWindowHours: 24, allowCancelAfterShipment: false });

    // Unpaid, fresh → cancelled, no refund.
    const pending = await order({ status: 'PENDING', ageDays: 0 });
    const r1 = await commerce.returns.cancelOrderByCustomer(storeId, pending.number, 'buyer@ex.com');
    expect(r1).toMatchObject({ cancelled: true, refunded: false });
    expect((await prisma.order.findUnique({ where: { id: pending.id } }))!.status).toBe('CANCELLED');

    // Paid, fresh → cancelled + refunded.
    const paid = await order({ status: 'PAID', ageDays: 0, paid: true });
    const r2 = await commerce.returns.cancelOrderByCustomer(storeId, paid.number, 'BUYER@ex.com');
    expect(r2).toMatchObject({ cancelled: true, refunded: true });
    expect((await prisma.order.findUnique({ where: { id: paid.id } }))!.status).toBe('CANCELLED');
  });

  it('blocks cancellation outside the window, after shipment, or once fulfilled', async () => {
    await commerce.returns.setPolicy(ctx, { storeId, cancelEnabled: true, cancelWindowHours: 2, allowCancelAfterShipment: false });

    const stale = await order({ status: 'PAID', ageDays: 1 }); // older than 2h
    await expect(commerce.returns.cancelOrderByCustomer(storeId, stale.number, 'buyer@ex.com')).rejects.toBeInstanceOf(ValidationError);

    const shipped = await order({ status: 'PAID', ageDays: 0, shipped: true });
    await expect(commerce.returns.cancelOrderByCustomer(storeId, shipped.number, 'buyer@ex.com')).rejects.toBeInstanceOf(ValidationError);

    const fulfilled = await order({ status: 'FULFILLED', ageDays: 0 });
    await expect(commerce.returns.cancelOrderByCustomer(storeId, fulfilled.number, 'buyer@ex.com')).rejects.toBeInstanceOf(ValidationError);
  });
});
