import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import type { TenantContext } from '../src/context.js';

/**
 * Exercises the multi-channel notification system against a real DB: channel
 * resolution from integrations, recipient address resolution, preference
 * overrides, and graceful skips. Skips entirely without DATABASE_URL.
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('notifications', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Notif Test' } });
    ctx = { tenantId: tenant.id };
    const store = await commerce.stores.create(ctx, {
      name: 'Notif Store',
      ownerEmail: 'owner@example.com',
      ownerPhone: '+919800000001',
    });
    storeId = store.id;
    // Configure all three channels with stub credentials.
    for (const provider of ['RESEND', 'MSG91', 'WHATSAPP'] as const) {
      await commerce.integrations.configure(ctx, { storeId, provider, credentials: { stub: true } });
    }
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('fans an event out to customer + owner across configured channels', async () => {
    const results = await commerce.notifications.notify(ctx, {
      storeId,
      event: 'ORDER_PLACED',
      data: {
        customerName: 'Asha',
        customerEmail: 'asha@example.com',
        customerPhone: '+919800000002',
        orderNumber: 7,
        total: '₹498.00',
      },
    });

    // Defaults: CUSTOMER [EMAIL, WHATSAPP] + STORE_OWNER [EMAIL] = 3 sends.
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.status === 'SENT')).toBe(true);
    expect(results.filter((r) => r.recipientType === 'CUSTOMER')).toHaveLength(2);
    expect(results.find((r) => r.recipientType === 'STORE_OWNER')?.to).toBe('owner@example.com');

    // Audit rows persisted.
    const logged = await commerce.notifications.listNotifications(ctx, storeId);
    expect(logged.length).toBeGreaterThanOrEqual(3);
  });

  it('skips a channel that has no recipient address', async () => {
    const results = await commerce.notifications.notify(ctx, {
      storeId,
      event: 'ORDER_PLACED',
      recipientType: 'CUSTOMER',
      data: { customerEmail: 'only@example.com', orderNumber: 8 }, // no phone
    });
    const whatsapp = results.find((r) => r.channel === 'WHATSAPP');
    expect(whatsapp?.status).toBe('SKIPPED');
    expect(whatsapp?.reason).toBe('no_recipient_address');
    expect(results.find((r) => r.channel === 'EMAIL')?.status).toBe('SENT');
  });

  it('skips a channel whose provider is not configured', async () => {
    const bare = await commerce.stores.create(ctx, { name: 'Bare Store', ownerEmail: 'o@x.com' });
    const results = await commerce.notifications.notify(ctx, {
      storeId: bare.id,
      event: 'ORDER_PLACED',
      recipientType: 'STORE_OWNER',
      data: {},
    });
    expect(results.find((r) => r.channel === 'EMAIL')?.reason).toBe('channel_not_configured');
  });

  it('honours a preference override', async () => {
    await commerce.notifications.setPreference(ctx, {
      storeId,
      event: 'ORDER_PAID',
      recipientType: 'CUSTOMER',
      channels: ['EMAIL'],
    });
    const results = await commerce.notifications.notify(ctx, {
      storeId,
      event: 'ORDER_PAID',
      recipientType: 'CUSTOMER',
      data: { customerEmail: 'p@example.com', customerPhone: '+91980', orderNumber: 9, total: '₹10' },
    });
    expect(results).toHaveLength(1);
    expect(results[0].channel).toBe('EMAIL');
  });
});
