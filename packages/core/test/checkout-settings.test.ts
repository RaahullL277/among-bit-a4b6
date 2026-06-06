import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { ValidationError, type TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('checkout tax, shipping & delivery address', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;
  let variantId: string;

  async function cart(qty: number) {
    return commerce.storefront.createCart(storeId, { items: [{ variantId, quantity: qty }] });
  }

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'CO Co' } });
    ctx = { tenantId: tenant.id };
    storeId = (await commerce.stores.create(ctx, { name: 'CO Store' })).id;
    await commerce.integrations.configure(ctx, { storeId, provider: 'RAZORPAY', credentials: { webhookSecret: 's' } });
    const p = await commerce.products.create(ctx, { storeId, title: 'Item', status: 'ACTIVE', variants: [{ priceMinor: 100000, inventory: 1000 }] });
    variantId = p.variants[0].id;
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('quotes tax (exclusive) + flat shipping, with a free-shipping threshold', async () => {
    await commerce.checkoutSettings.set(ctx, { storeId, taxBps: 1800, taxLabel: 'GST', flatShippingMinor: 5000, freeShippingOverMinor: 200000 });

    const q1 = await commerce.storefront.checkoutQuote((await cart(1)).id); // ₹1000 subtotal
    expect(q1).toMatchObject({ subtotalMinor: 100000, taxMinor: 18000, shippingMinor: 5000, totalMinor: 123000, taxLabel: 'GST' });

    const q2 = await commerce.storefront.checkoutQuote((await cart(3)).id); // ₹3000 ≥ free threshold
    expect(q2).toMatchObject({ subtotalMinor: 300000, taxMinor: 54000, shippingMinor: 0, totalMinor: 354000 });
  });

  it('computes tax-inclusive correctly (tax extracted, total unchanged)', async () => {
    await commerce.checkoutSettings.set(ctx, { storeId, taxBps: 1800, pricesIncludeTax: true, flatShippingMinor: 0, freeShippingOverMinor: null });
    const q = await commerce.storefront.checkoutQuote((await cart(1)).id);
    expect(q.totalMinor).toBe(100000); // tax already in the price
    expect(q.taxMinor).toBe(Math.round((100000 * 1800) / 11800)); // extracted
  });

  it('persists subtotal/tax/shipping + the delivery address & email on the order', async () => {
    await commerce.checkoutSettings.set(ctx, { storeId, taxBps: 1800, pricesIncludeTax: false, flatShippingMinor: 5000, freeShippingOverMinor: null, requireAddress: true });

    // Address required → blocked without one.
    await expect(commerce.storefront.checkout((await cart(1)).id, { email: 'b@ex.com' })).rejects.toBeInstanceOf(ValidationError);

    const address = { name: 'Asha', phone: '+9190000', line1: '12 MG Road', city: 'Bengaluru', state: 'KA', pincode: '560001', country: 'IN' };
    const out: any = await commerce.storefront.checkout((await cart(2)).id, { email: 'asha@ex.com', shippingAddress: address });
    const order = await prisma.order.findUnique({ where: { id: out.order.id } });
    expect(order!.subtotalMinor).toBe(200000);
    expect(order!.taxMinor).toBe(36000);
    expect(order!.shippingMinor).toBe(5000);
    expect(order!.totalMinor).toBe(241000); // 200000 + 36000 + 5000
    expect(order!.email).toBe('asha@ex.com');
    expect((order!.shippingAddress as any).pincode).toBe('560001');
  });
});
