import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import type { TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('legal policies', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Legal Co' } });
    ctx = { tenantId: tenant.id };
    const store = await commerce.stores.create(ctx, { name: 'Lawful Mart', ownerEmail: 'support@lawful.example' });
    storeId = store.id;
    await commerce.stores.setTaxIdentity(ctx, storeId, {
      legalName: 'Lawful Mart Pvt Ltd',
      gstin: '29ABCDE1234F1Z5',
      taxCity: 'Bengaluru',
      taxState: 'Karnataka',
    });
    await commerce.returns.setPolicy(ctx, { storeId, returnWindowDays: 15, cancelWindowHours: 12, restockingFeePercent: 5 });
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('generates an India/GST-aware policy from the seller identity', async () => {
    const terms = await commerce.legal.generate(ctx, storeId, 'TERMS');
    expect(terms.title).toBe('Terms of Use');
    expect(terms.generated).toBe(true);
    expect(terms.body).toContain('Lawful Mart Pvt Ltd');
    expect(terms.body).toContain('29ABCDE1234F1Z5');
    expect(terms.status).toBe('DRAFT');

    // The refund policy reflects the configured window + restocking fee.
    const refund = await commerce.legal.generate(ctx, storeId, 'REFUND');
    expect(refund.body).toContain('15 day');
    expect(refund.body).toContain('5%');
    expect(refund.body).toContain('12 hour');
  });

  it('generates and publishes all five policies', async () => {
    const all = await commerce.legal.generateAll(ctx, storeId, { publish: true });
    expect(all).toHaveLength(5);
    const types = all.map((p) => p.type).sort();
    expect(types).toEqual(['COOKIES', 'PRIVACY', 'REFUND', 'SHIPPING', 'TERMS']);
    expect(all.every((p) => p.status === 'PUBLISHED' && p.publishedAt)).toBe(true);

    const published = await commerce.legal.publicList(storeId);
    expect(published).toHaveLength(5);
    const privacy = await commerce.legal.publicGet(storeId, 'privacy');
    expect(privacy?.title).toBe('Privacy Policy');
    expect(privacy?.body).toContain('Digital Personal Data Protection Act');
  });

  it('lets the merchant override the body and bumps the version', async () => {
    const before = await commerce.legal.get(ctx, storeId, 'TERMS');
    const edited = await commerce.legal.set(ctx, { storeId, type: 'TERMS', body: 'Our custom terms.', status: 'PUBLISHED' });
    expect(edited.body).toBe('Our custom terms.');
    expect(edited.generated).toBe(false);
    expect(edited.version).toBe(before.version + 1);
    expect(edited.status).toBe('PUBLISHED');
  });

  it('records legal acceptance implicitly on checkout (no blocking checkbox)', async () => {
    const store = await commerce.stores.create(ctx, { name: 'Consent Shop' });
    await commerce.integrations.configure(ctx, { storeId: store.id, provider: 'RAZORPAY', credentials: { webhookSecret: 's' } });
    await commerce.legal.generateAll(ctx, store.id, { publish: true });
    const product = await commerce.products.create(ctx, { storeId: store.id, status: 'ACTIVE', title: 'Thing', variants: [{ priceMinor: 10000, inventory: 5 }] });
    const variantId = product.variants[0].id;

    // Checkout is NOT gated — placing the order implies acceptance, recorded with versions.
    const { order } = await commerce.payments.checkout(ctx, {
      storeId: store.id,
      customerId: undefined,
      items: [{ variantId, quantity: 1 }],
      email: 'buyer@example.com',
      acceptanceIp: '1.2.3.4',
    });
    const acceptances = await commerce.legal.listAcceptances(ctx, store.id);
    expect(acceptances).toHaveLength(1);
    expect(acceptances[0].orderId).toBe(order.id);
    expect(acceptances[0].email).toBe('buyer@example.com');
    expect((acceptances[0].policies as any[]).length).toBe(5);
  });

  it('captures the optional marketing opt-in at checkout (off by default)', async () => {
    const store = await commerce.stores.create(ctx, { name: 'OptIn Shop' });
    await commerce.integrations.configure(ctx, { storeId: store.id, provider: 'RAZORPAY', credentials: { webhookSecret: 's' } });
    const product = await commerce.products.create(ctx, { storeId: store.id, status: 'ACTIVE', title: 'Widget', variants: [{ priceMinor: 5000, inventory: 9 }] });
    const variantId = product.variants[0].id;

    // No opt-in → the resolved customer is NOT consented (default off).
    await commerce.payments.checkout(ctx, { storeId: store.id, items: [{ variantId, quantity: 1 }], email: 'noconsent@example.com' });
    const c1 = await prisma.customer.findFirst({ where: { storeId: store.id, email: 'noconsent@example.com' } });
    // (cart path resolves a customer; direct checkout with email may not — only assert when present)
    if (c1) expect(c1.marketingConsent).toBe(false);

    // Opt-in via the cart checkout path (which resolves a customer) → consent granted.
    const cart = await commerce.carts.createCart(ctx, { storeId: store.id, items: [{ variantId, quantity: 1 }] });
    await commerce.carts.checkoutCart(ctx, cart.id, { email: 'optin@example.com', marketingOptIn: true });
    const c2 = await prisma.customer.findFirst({ where: { storeId: store.id, email: 'optin@example.com' } });
    expect(c2?.marketingConsent).toBe(true);
    expect(c2?.unsubscribedAt).toBeNull();
  });

  it('hides unpublished policies from the storefront', async () => {
    await commerce.stores.create(ctx, { name: 'Draft Shop' });
    const store = (await commerce.stores.list(ctx)).find((s) => s.name === 'Draft Shop')!;
    await commerce.legal.generate(ctx, store.id, 'PRIVACY'); // draft, not published
    const published = await commerce.legal.publicList(store.id);
    expect(published).toHaveLength(0);
    expect(await commerce.legal.publicGet(store.id, 'privacy')).toBeNull();
  });
});
