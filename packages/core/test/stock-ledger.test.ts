import { createHmac, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { NotFoundError, ValidationError, type TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('stock adjustments + movement ledger', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;
  let variantId: string;

  async function inv() {
    return (await prisma.productVariant.findUnique({ where: { id: variantId }, select: { inventory: true } }))!.inventory;
  }

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Ledger Co' } });
    // Manual moves record the acting user.
    ctx = { tenantId: tenant.id, actor: { kind: 'user', userId: 'u-1', role: 'OWNER', permissions: [] } };
    const store = await commerce.stores.create(ctx, { name: 'Ledger Store' });
    storeId = store.id;
    await commerce.integrations.configure(ctx, { storeId, provider: 'RAZORPAY', credentials: { webhookSecret: 's' } });
    const p = await commerce.products.create(ctx, { storeId, title: 'Widget', status: 'ACTIVE', variants: [{ priceMinor: 50000, inventory: 10 }] });
    variantId = p.variants[0].id;
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('receives, adjusts, and sets absolute count — each ledgered with balance + actor', async () => {
    const r = await commerce.stock.receive(ctx, { variantId, quantity: 5, note: 'PO #1' });
    expect(r.inventory).toBe(15);

    const a = await commerce.stock.adjust(ctx, { variantId, delta: -3, note: 'damaged' });
    expect(a.inventory).toBe(12);

    const s = await commerce.stock.setInventory(ctx, { variantId, quantity: 20, note: 'stocktake' });
    expect(s.inventory).toBe(20);
    expect(await inv()).toBe(20);

    const ledger = await commerce.stock.ledger(ctx, { storeId, variantId });
    // Newest first: ADJUST(set +8), ADJUST(-3), RECEIVE(+5).
    expect(ledger.slice(0, 3).map((m) => [m.reason, m.delta, m.balance])).toEqual([
      ['ADJUST', 8, 20],
      ['ADJUST', -3, 12],
      ['RECEIVE', 5, 15],
    ]);
    expect(ledger[0].actorKind).toBe('user'); // manual moves record the actor
    expect(ledger.find((m) => m.note === 'PO #1')).toBeTruthy();
  });

  it('records SALE and RETURN/CANCEL movements as the system actor', async () => {
    await commerce.stock.setInventory(ctx, { variantId, quantity: 10 });
    // Capture a sale of 4.
    const cart = await commerce.storefront.createCart(storeId, { items: [{ variantId, quantity: 4 }] });
    const out: any = await commerce.carts.checkoutCart(ctx, cart.id);
    const order = out.order;
    const body = JSON.stringify({ providerRef: order.payment.providerRef, status: 'CAPTURED' });
    await commerce.payments.handleWebhook('RAZORPAY', body, createHmac('sha256', 's').update(body).digest('hex'));
    expect(await inv()).toBe(6);

    // Cancel the paid order → restock.
    await commerce.orders.updateStatus(ctx, order.id, 'CANCELLED');
    expect(await inv()).toBe(10);

    const ledger = await commerce.stock.ledger(ctx, { storeId, variantId });
    const cancel = ledger[0];
    const sale = ledger[1];
    expect([cancel.reason, cancel.delta, cancel.balance]).toEqual(['CANCEL', 4, 10]);
    expect([sale.reason, sale.delta, sale.balance]).toEqual(['SALE', -4, 6]);
    expect(sale.actorKind).toBe('system'); // automated movement
    expect(sale.orderId).toBe(order.id);
  });

  it('validates inputs and tenant scope', async () => {
    await expect(commerce.stock.adjust(ctx, { variantId, delta: 0 })).rejects.toBeInstanceOf(ValidationError);
    await expect(commerce.stock.receive(ctx, { variantId, quantity: -1 })).rejects.toBeInstanceOf(ValidationError);
    await expect(commerce.stock.setInventory(ctx, { variantId, quantity: -5 })).rejects.toBeInstanceOf(ValidationError);
    await expect(commerce.stock.adjust({ tenantId: 'other' }, { variantId, delta: 1 })).rejects.toBeInstanceOf(NotFoundError);
  });
});
