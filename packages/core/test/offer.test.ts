import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { ValidationError, type TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('offers (bundles + frequently bought together)', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;
  // Three products with one variant each.
  const v: Record<string, { productId: string; variantId: string; price: number }> = {};

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Bundle Co' } });
    ctx = { tenantId: tenant.id };
    const store = await commerce.stores.create(ctx, { name: 'Bundle Store' });
    storeId = store.id;
    // Configure the stub payment provider so checkout works.
    await commerce.integrations.configure(ctx, {
      storeId,
      provider: 'RAZORPAY',
      credentials: { webhookSecret: 'w' },
    });
    for (const [name, price] of [['phone', 100000], ['case', 20000], ['charger', 30000]] as const) {
      const p = await commerce.products.create(ctx, {
        storeId,
        title: name,
        status: 'ACTIVE',
        variants: [{ priceMinor: price, inventory: 100 }],
      });
      v[name] = { productId: p.id, variantId: p.variants[0].id, price };
    }
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('rejects invalid bundles (too few items / bad discount)', async () => {
    await expect(
      commerce.offers.createBundle(ctx, { storeId, title: 'Solo', items: [{ variantId: v.phone.variantId }] }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      commerce.offers.createBundle(ctx, {
        storeId,
        title: 'Too much',
        discountType: 'PERCENT',
        discountValue: 150,
        items: [{ variantId: v.phone.variantId }, { variantId: v.case.variantId }],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('prices a percent bundle and lists it for each member product', async () => {
    const bundle = await commerce.offers.createBundle(ctx, {
      storeId,
      title: 'Phone + Case',
      discountType: 'PERCENT',
      discountValue: 10,
      items: [{ variantId: v.phone.variantId }, { variantId: v.case.variantId }],
    });
    // subtotal 120000, 10% off → 12000 saving.
    expect(bundle.subtotalMinor).toBe(120000);
    expect(bundle.discountMinor).toBe(12000);
    expect(bundle.totalMinor).toBe(108000);

    const forPhone = await commerce.offers.bundlesForProduct(storeId, v.phone.productId);
    expect(forPhone.map((b) => b.id)).toContain(bundle.id);
    const forCase = await commerce.offers.bundlesForProduct(storeId, v.case.productId);
    expect(forCase.map((b) => b.id)).toContain(bundle.id);
    // Charger is not in the bundle.
    const forCharger = await commerce.offers.bundlesForProduct(storeId, v.charger.productId);
    expect(forCharger).toHaveLength(0);
  });

  it('auto-applies the bundle saving at checkout only when all items are present', async () => {
    // Cart with just the phone → no bundle qualifies.
    const noDiscount = await commerce.offers.computeCartDiscount(ctx, storeId, [
      { variantId: v.phone.variantId, quantity: 1 },
    ]);
    expect(noDiscount.discountMinor).toBe(0);

    // Cart with phone + case → the 10% bundle applies.
    const cart = await commerce.carts.createCart(ctx, {
      storeId,
      items: [
        { variantId: v.phone.variantId, quantity: 1 },
        { variantId: v.case.variantId, quantity: 1 },
      ],
    });
    const result = await commerce.carts.checkoutCart(ctx, cart.id);
    expect(result.order.discountMinor).toBe(12000);
    expect(result.order.totalMinor).toBe(108000);
    expect(result.order.payment?.amountMinor).toBe(108000);
  });

  it('ranks frequently-bought-together from paid order history', async () => {
    // The checkout above produced a PENDING order; mark a couple of orders PAID
    // with phone+charger to build co-purchase history.
    for (let i = 0; i < 2; i++) {
      await prisma.order.create({
        data: {
          tenantId: ctx.tenantId,
          storeId,
          number: 100 + i,
          status: 'PAID',
          totalMinor: 130000,
          items: {
            create: [
              { tenantId: ctx.tenantId, variantId: v.phone.variantId, title: 'phone', quantity: 1, unitPriceMinor: 100000 },
              { tenantId: ctx.tenantId, variantId: v.charger.variantId, title: 'charger', quantity: 1, unitPriceMinor: 30000 },
            ],
          },
        },
      });
    }
    const fbt = await commerce.offers.frequentlyBoughtTogether(storeId, v.phone.productId);
    expect(fbt[0]?.productId).toBe(v.charger.productId);
    expect(fbt[0]?.count).toBe(2);
  });

  it('updates and deletes bundles, scoped to the tenant', async () => {
    const bundle = await commerce.offers.createBundle(ctx, {
      storeId,
      title: 'Flat off',
      discountType: 'FIXED',
      discountValue: 5000,
      items: [{ variantId: v.phone.variantId }, { variantId: v.charger.variantId }],
    });
    expect(bundle.discountMinor).toBe(5000);

    const updated = await commerce.offers.updateBundle(ctx, bundle.id, { active: false, discountValue: 9000 });
    expect(updated.active).toBe(false);
    expect(updated.discountMinor).toBe(9000);

    // Inactive bundles never apply at checkout.
    const none = await commerce.offers.computeCartDiscount(ctx, storeId, [
      { variantId: v.phone.variantId, quantity: 1 },
      { variantId: v.charger.variantId, quantity: 1 },
    ]);
    expect(none.applied.find((a) => a.bundleId === bundle.id)).toBeUndefined();

    const del = await commerce.offers.deleteBundle(ctx, bundle.id);
    expect(del.deleted).toBe(true);

    const other = { tenantId: 'nonexistent-tenant' };
    await expect(commerce.offers.getBundle(other, bundle.id)).rejects.toBeTruthy();
  });
});
