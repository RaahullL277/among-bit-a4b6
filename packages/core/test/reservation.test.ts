import { createHmac, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { ValidationError, type TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('stock reservations (race-safe holds)', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;
  let n = 0;

  // A fresh product per test so reservations don't bleed across cases.
  async function product(inventory: number) {
    const p = await commerce.products.create(ctx, { storeId, title: `P${n++}`, status: 'ACTIVE', variants: [{ priceMinor: 50000, inventory }] });
    return p.variants[0].id;
  }
  async function snap(vid: string) {
    const v = await prisma.productVariant.findUnique({ where: { id: vid }, select: { inventory: true, reserved: true } });
    return { inventory: v!.inventory, reserved: v!.reserved };
  }
  async function checkout(vid: string, quantity: number) {
    const cart = await commerce.storefront.createCart(storeId, { items: [{ variantId: vid, quantity }] });
    const out: any = await commerce.carts.checkoutCart(ctx, cart.id);
    return out.order;
  }
  async function webhook(order: any, status: 'CAPTURED' | 'FAILED') {
    const body = JSON.stringify({ providerRef: order.payment.providerRef, status });
    await commerce.payments.handleWebhook('RAZORPAY', body, createHmac('sha256', 's').update(body).digest('hex'));
  }

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Res Co' } });
    ctx = { tenantId: tenant.id };
    const store = await commerce.stores.create(ctx, { name: 'Res Store' });
    storeId = store.id;
    await commerce.integrations.configure(ctx, { storeId, provider: 'RAZORPAY', credentials: { webhookSecret: 's' } });
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('holds stock at checkout and blocks a second order that exceeds availability', async () => {
    const vid = await product(5);
    await checkout(vid, 3); // pending, not paid
    expect(await snap(vid)).toEqual({ inventory: 5, reserved: 3 }); // on-hand unchanged, 3 held

    // The race: inventory is still 5, but only 2 are AVAILABLE — a second order
    // for 3 must be refused (pre-reservation, this oversold).
    await expect(checkout(vid, 3)).rejects.toBeInstanceOf(ValidationError);
    // …and 2 still fits.
    await checkout(vid, 2);
    expect(await snap(vid)).toEqual({ inventory: 5, reserved: 5 }); // fully reserved
    await expect(checkout(vid, 1)).rejects.toBeInstanceOf(ValidationError); // out of available
  });

  it('capture turns the hold into a sale (reserved freed, inventory consumed)', async () => {
    const vid = await product(10);
    const order = await checkout(vid, 4);
    expect(await snap(vid)).toEqual({ inventory: 10, reserved: 4 });
    await webhook(order, 'CAPTURED');
    expect(await snap(vid)).toEqual({ inventory: 6, reserved: 0 }); // available stays 6
  });

  it('releases the hold when an unpaid order is cancelled or fails', async () => {
    const vid = await product(10);
    const o1 = await checkout(vid, 3);
    expect((await snap(vid)).reserved).toBe(3);
    await commerce.orders.updateStatus(ctx, o1.id, 'CANCELLED'); // merchant cancels a pending order
    expect(await snap(vid)).toEqual({ inventory: 10, reserved: 0 }); // freed, never consumed

    const o2 = await checkout(vid, 2);
    expect((await snap(vid)).reserved).toBe(2);
    await webhook(o2, 'FAILED'); // payment fails
    expect(await snap(vid)).toEqual({ inventory: 10, reserved: 0 });
  });

  it('expires stale pending holds and cancels the order', async () => {
    const vid = await product(8);
    const order = await checkout(vid, 5);
    expect((await snap(vid)).reserved).toBe(5);

    // Pretend a day has passed with no payment.
    const res = await commerce.stock.releaseExpiredReservations(new Date(Date.now() + 25 * 3_600_000), 24);
    expect(res.released).toBeGreaterThanOrEqual(1);
    expect(await snap(vid)).toEqual({ inventory: 8, reserved: 0 });
    expect((await prisma.order.findUnique({ where: { id: order.id }, select: { status: true } }))!.status).toBe('CANCELLED');
  });

  it('exposes buyer availability (in/low/out) on the storefront without raw checks', async () => {
    const vid = await product(3); // low (<= 5)
    const list: any[] = await commerce.storefront.listProducts(storeId);
    const row = list.find((p) => p.variants[0]?.id === vid);
    expect(row.variants[0].availability).toBe('low_stock');
    expect(row.availability).toBe('in_stock');

    await checkout(vid, 3); // reserve all 3 → available 0
    const after: any[] = await commerce.storefront.listProducts(storeId);
    expect(after.find((p) => p.variants[0]?.id === vid).variants[0].availability).toBe('out_of_stock');
  });
});
