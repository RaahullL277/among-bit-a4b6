import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { getMarketingProvider } from '../src/adapters/registry.js';
import type { TenantContext } from '../src/context.js';

describe('marketing adapters (stub)', () => {
  it('upserts contacts and tracks events', async () => {
    const k = getMarketingProvider('KLAVIYO', { apiKey: 'x' });
    const c = await k.upsertContact({ email: 'a@b.com', name: 'A' });
    expect(c.status).toBe('OK');
    expect(c.provider).toBe('KLAVIYO');
    const e = await k.trackEvent({ email: 'a@b.com', event: 'Placed Order' });
    expect(e.status).toBe('OK');
  });
});

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('marketing service', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Mkt Co' } });
    ctx = { tenantId: tenant.id };
    const store = await commerce.stores.create(ctx, { name: 'Mkt Store' });
    storeId = store.id;
    await commerce.integrations.configure(ctx, { storeId, provider: 'KLAVIYO', credentials: { apiKey: 'k', listId: 'L1' } });
    await commerce.integrations.configure(ctx, { storeId, provider: 'BREVO', credentials: { apiKey: 'b' } });
    await commerce.integrations.configure(ctx, { storeId, provider: 'MAILCHIMP', credentials: { apiKey: 'm' }, enabled: false });
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('lists only enabled marketing providers', async () => {
    const providers = await commerce.marketing.enabledProviders(ctx, storeId);
    expect(providers.sort()).toEqual(['BREVO', 'KLAVIYO']);
  });

  it('syncs a customer with an email to each enabled provider', async () => {
    const customer = await commerce.customers.create(ctx, { storeId, name: 'Asha', email: 'asha@example.com' });
    const r = await commerce.marketing.syncCustomer(ctx, customer.id);
    expect(r.synced).toBe(2);

    const noEmail = await commerce.customers.create(ctx, { storeId, name: 'Anon' });
    const r2 = await commerce.marketing.syncCustomer(ctx, noEmail.id);
    expect(r2.synced).toBe(0);
  });

  it('tracks a paid order to the enabled providers', async () => {
    const customer = await commerce.customers.create(ctx, { storeId, email: 'buyer@example.com' });
    const order = await prisma.order.create({
      data: { tenantId: ctx.tenantId, storeId, number: 1, customerId: customer.id, status: 'PAID', totalMinor: 50000 },
    });
    const r = await commerce.marketing.trackOrder(ctx, order.id);
    expect(r.tracked).toBe(2);
  });

  it('re-syncs all customers', async () => {
    const r = await commerce.marketing.syncAll(ctx, storeId);
    expect(r.providers).toBe(2);
    expect(r.customers).toBeGreaterThanOrEqual(2);
  });
});
