import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { type TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('storefront buyer features (search / track / wishlist)', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;
  let shirtId: string;

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Buyer Co' } });
    ctx = { tenantId: tenant.id };
    storeId = (await commerce.stores.create(ctx, { name: 'Buyer Store' })).id;
    const shirt = await commerce.products.create(ctx, { storeId, title: 'Blue Cotton Shirt', description: 'Breathable summer shirt', status: 'ACTIVE', variants: [{ priceMinor: 79900, inventory: 5 }] });
    shirtId = shirt.id;
    await commerce.products.create(ctx, { storeId, title: 'Red Cap', status: 'ACTIVE', variants: [{ priceMinor: 29900, inventory: 5 }] });
    // Draft product must never appear in storefront search.
    await commerce.products.create(ctx, { storeId, title: 'Blue Draft Jacket', status: 'DRAFT', variants: [{ priceMinor: 99900 }] });
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('searches active products by title/description', async () => {
    const blue = await commerce.storefront.searchProducts(storeId, 'blue');
    expect(blue.map((p: any) => p.title)).toContain('Blue Cotton Shirt');
    expect(blue.some((p: any) => p.title === 'Blue Draft Jacket')).toBe(false); // draft excluded

    const summer = await commerce.storefront.searchProducts(storeId, 'summer'); // matches description
    expect(summer.some((p: any) => p.title === 'Blue Cotton Shirt')).toBe(true);

    expect(await commerce.storefront.searchProducts(storeId, '')).toEqual([]);
  });

  it('manages a guest wishlist keyed by email (idempotent add, remove)', async () => {
    await commerce.storefront.addToWishlist(storeId, 'Shopper@Ex.com', shirtId);
    await commerce.storefront.addToWishlist(storeId, 'shopper@ex.com', shirtId); // same (case-insensitive) → no dup

    const list = await commerce.storefront.wishlist(storeId, 'shopper@ex.com');
    expect(list).toHaveLength(1);
    expect((list[0] as any).productId).toBe(shirtId);

    await commerce.storefront.removeFromWishlist(storeId, 'shopper@ex.com', shirtId);
    expect(await commerce.storefront.wishlist(storeId, 'shopper@ex.com')).toHaveLength(0);
  });

  it('tracks an order with its shipment by number + email', async () => {
    const customer = await prisma.customer.create({ data: { tenantId: ctx.tenantId, storeId, email: 'buyer@ex.com', name: 'Buyer' } });
    const order = await prisma.order.create({
      data: {
        tenantId: ctx.tenantId, storeId, number: 1001, customerId: customer.id, status: 'PAID', totalMinor: 79900,
        items: { create: [{ tenantId: ctx.tenantId, title: 'Blue Cotton Shirt', quantity: 1, unitPriceMinor: 79900 }] },
      },
    });
    await prisma.shipment.create({ data: { tenantId: ctx.tenantId, storeId, orderId: order.id, provider: 'DELHIVERY', status: 'IN_TRANSIT', courier: 'Delhivery', awb: 'AWB123', trackingUrl: 'https://track/AWB123', toAddress: { city: 'Mumbai' } } });

    const tracked = await commerce.storefront.trackOrder(storeId, 1001, 'BUYER@ex.com');
    expect(tracked?.status).toBe('PAID');
    expect(tracked?.shipment?.status).toBe('IN_TRANSIT');
    expect(tracked?.shipment?.awb).toBe('AWB123');

    // Wrong email → nothing leaks.
    expect(await commerce.storefront.trackOrder(storeId, 1001, 'stranger@ex.com')).toBeNull();
  });
});
