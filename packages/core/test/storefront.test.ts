import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { NotFoundError, type TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('storefront (public)', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;
  let activeVariant: string;

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'SF Test' } });
    ctx = { tenantId: tenant.id };
    const store = await commerce.stores.create(ctx, { name: 'SF Store' });
    storeId = store.id;
    await commerce.integrations.configure(ctx, { storeId, provider: 'RAZORPAY', credentials: { webhookSecret: 's' } });

    const active = await commerce.products.create(ctx, {
      storeId,
      title: 'Public Tea',
      status: 'ACTIVE',
      variants: [{ priceMinor: 30000, inventory: 10 }],
    });
    activeVariant = active.variants[0].id;
    await commerce.products.create(ctx, {
      storeId,
      title: 'Hidden Draft',
      status: 'DRAFT',
      variants: [{ priceMinor: 10000 }],
    });
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('exposes only active products to buyers', async () => {
    const products = await commerce.storefront.listProducts(storeId);
    expect(products.map((p) => p.title)).toEqual(['Public Tea']);
  });

  it('runs a public browse → cart → checkout flow', async () => {
    const cart = await commerce.storefront.createCart(storeId, {
      contactEmail: 'guest@example.com',
      items: [{ variantId: activeVariant, quantity: 2 }],
    });
    expect(cart.items).toHaveLength(1);

    const fetched = await commerce.storefront.getCart(cart.id);
    expect(fetched.id).toBe(cart.id);

    const { order, checkout } = await commerce.storefront.checkout(cart.id);
    expect(order.totalMinor).toBe(60000);
    expect(order.cartId).toBe(cart.id);
    expect(String((checkout as any).hostedCheckoutUrl)).toContain('http');

    expect((await commerce.storefront.getCart(cart.id)).status).toBe('CONVERTED');
  });

  it('hides a non-existent or suspended store', async () => {
    await expect(commerce.storefront.getStore('nope')).rejects.toBeInstanceOf(NotFoundError);
  });
});
