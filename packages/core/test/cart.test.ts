import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import type { TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('carts & recovery', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;
  let variantId: string;

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Cart Test' } });
    ctx = { tenantId: tenant.id };
    const store = await commerce.stores.create(ctx, { name: 'Cart Store' });
    storeId = store.id;
    await commerce.integrations.configure(ctx, {
      storeId,
      provider: 'RAZORPAY',
      credentials: { webhookSecret: 's' },
    });
    await commerce.integrations.configure(ctx, {
      storeId,
      provider: 'RESEND',
      credentials: { apiKey: 'stub' },
    });
    const product = await commerce.products.create(ctx, {
      storeId,
      title: 'Mug',
      variants: [{ priceMinor: 50000, inventory: 100 }],
    });
    variantId = product.variants[0].id;
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('builds a cart and checks it out, linking the order', async () => {
    const cart = await commerce.carts.createCart(ctx, {
      storeId,
      contactEmail: 'buyer@example.com',
      items: [{ variantId, quantity: 2 }],
    });
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].quantity).toBe(2);

    const { order } = await commerce.carts.checkoutCart(ctx, cart.id);
    expect(order.cartId).toBe(cart.id);
    const after = await commerce.carts.getCart(ctx, cart.id);
    expect(after.status).toBe('CONVERTED');
  });

  it('abandons an idle cart and sends a recovery message', async () => {
    const cart = await commerce.carts.createCart(ctx, {
      storeId,
      contactEmail: 'lapsed@example.com',
      items: [{ variantId, quantity: 1 }],
    });
    // Simulate 2h of inactivity (default threshold is 60 min).
    await prisma.cart.update({
      where: { id: cart.id },
      data: { lastActivityAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    });

    const result = await commerce.carts.runRecoveryJobs();
    expect(result.abandoned).toBeGreaterThanOrEqual(1);

    const recovered = await commerce.carts.getCart(ctx, cart.id);
    expect(recovered.status).toBe('ABANDONED');
    expect(recovered.recoveryStepsSent).toBe(1); // first step (delay 0) sent

    // An abandoned-cart email was logged for the contact.
    const notes = await commerce.notifications.listNotifications(ctx, storeId);
    const recoveryEmail = notes.find(
      (n) => n.event === 'ABANDONED_CART' && n.to === 'lapsed@example.com' && n.status === 'SENT',
    );
    expect(recoveryEmail).toBeTruthy();
  });

  it('marks a recovered cart when an abandoned cart is paid', async () => {
    const cart = await commerce.carts.createCart(ctx, {
      storeId,
      contactEmail: 'comesback@example.com',
      items: [{ variantId, quantity: 1 }],
    });
    await prisma.cart.update({
      where: { id: cart.id },
      data: { status: 'ABANDONED', abandonedAt: new Date() },
    });

    const { order } = await commerce.carts.checkoutCart(ctx, cart.id);
    expect((await commerce.carts.getCart(ctx, cart.id)).status).toBe('RECOVERED');
    expect(order.cartId).toBe(cart.id);
  });

  it('respects a disabled recovery policy', async () => {
    const store = await commerce.stores.create(ctx, { name: 'No Recovery' });
    await commerce.carts.setPolicy(ctx, { storeId: store.id, enabled: false });
    const product = await commerce.products.create(ctx, {
      storeId: store.id,
      title: 'X',
      variants: [{ priceMinor: 100 }],
    });
    const cart = await commerce.carts.createCart(ctx, {
      storeId: store.id,
      items: [{ variantId: product.variants[0].id, quantity: 1 }],
    });
    await prisma.cart.update({
      where: { id: cart.id },
      data: { lastActivityAt: new Date(Date.now() - 5 * 60 * 60 * 1000) },
    });
    await commerce.carts.runRecoveryJobs();
    expect((await commerce.carts.getCart(ctx, cart.id)).status).toBe('ACTIVE');
  });
});
