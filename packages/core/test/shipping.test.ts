import { createHmac, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { ValidationError, type TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);
const SECRET = 'ship_secret';

describe.skipIf(!hasDb)('shipping', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;
  let orderId: string;

  function signed(body: object) {
    const raw = JSON.stringify(body);
    return { raw, sig: createHmac('sha256', SECRET).update(raw).digest('hex') };
  }

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Ship Test' } });
    ctx = { tenantId: tenant.id };
    const store = await commerce.stores.create(ctx, { name: 'Ship Store' });
    storeId = store.id;
    await commerce.integrations.configure(ctx, { storeId, provider: 'RAZORPAY', credentials: { webhookSecret: 'x' } });
    await commerce.integrations.configure(ctx, { storeId, provider: 'RESEND', credentials: { apiKey: 'stub' } });
    await commerce.integrations.configure(ctx, { storeId, provider: 'DELHIVERY', credentials: { webhookSecret: SECRET } });

    const customer = await commerce.customers.create(ctx, { storeId, name: 'Riya', email: 'riya@example.com' });
    const product = await commerce.products.create(ctx, { storeId, title: 'Kettle', variants: [{ priceMinor: 80000, inventory: 5 }] });
    const checkout = await commerce.payments.checkout(ctx, {
      storeId,
      customerId: customer.id,
      items: [{ variantId: product.variants[0].id, quantity: 1 }],
    });
    orderId = checkout.order.id;
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('creates a shipment, fulfils the order, and notifies the customer', async () => {
    const shipment = await commerce.shipping.createShipment(ctx, {
      orderId,
      to: { name: 'Riya', line1: '12 MG Road', city: 'Bengaluru', pincode: '560001' },
      weightGrams: 500,
    });
    expect(shipment.status).toBe('MANIFESTED');
    expect(shipment.awb).toMatch(/^DL/);
    expect(shipment.events).toHaveLength(1);

    const order = await commerce.orders.get(ctx, orderId);
    expect(order.status).toBe('FULFILLED');

    const notes = await commerce.notifications.listNotifications(ctx, storeId);
    expect(notes.find((n) => n.event === 'SHIPMENT_CREATED' && n.to === 'riya@example.com' && n.status === 'SENT')).toBeTruthy();
  });

  it('rejects a second shipment for the same order', async () => {
    await expect(
      commerce.shipping.createShipment(ctx, { orderId, to: { pincode: '560001' } }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('advances status from a signed tracking webhook and ignores bad signatures', async () => {
    const shipment = (await commerce.shipping.listShipments(ctx, { storeId }))[0];
    const awb = shipment.awb!;

    // Bad signature → not applied.
    const bad = signed({ awb, status: 'DELIVERED' });
    const badRes = await commerce.shipping.handleTrackingWebhook('DELHIVERY', bad.raw, 'nope');
    expect(badRes.signatureValid).toBe(false);

    // Valid signature → applied + customer notified.
    const ofd = signed({ awb, status: 'OUT_FOR_DELIVERY', description: 'On the van', location: 'Bengaluru' });
    const ofdRes = await commerce.shipping.handleTrackingWebhook('DELHIVERY', ofd.raw, ofd.sig);
    expect(ofdRes).toMatchObject({ routed: true, signatureValid: true, status: 'OUT_FOR_DELIVERY' });

    const delivered = signed({ awb, status: 'DELIVERED' });
    await commerce.shipping.handleTrackingWebhook('DELHIVERY', delivered.raw, delivered.sig);

    const updated = await commerce.shipping.getShipment(ctx, shipment.id);
    expect(updated.status).toBe('DELIVERED');
    expect(updated.events.length).toBeGreaterThanOrEqual(3);

    const notes = await commerce.notifications.listNotifications(ctx, storeId);
    expect(notes.some((n) => n.event === 'DELIVERED' && n.status === 'SENT')).toBe(true);
  });
});
