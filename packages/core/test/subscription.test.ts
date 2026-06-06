import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { ValidationError, type TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('subscriptions', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;
  let variantId: string;

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Sub Co' } });
    ctx = { tenantId: tenant.id };
    const store = await commerce.stores.create(ctx, { name: 'Sub Store' });
    storeId = store.id;
    await commerce.integrations.configure(ctx, { storeId, provider: 'RAZORPAY', credentials: { webhookSecret: 's' } });
    const product = await commerce.products.create(ctx, {
      storeId,
      title: 'Coffee beans',
      status: 'ACTIVE',
      variants: [{ priceMinor: 100000, inventory: 1000 }], // ₹1000
    });
    variantId = product.variants[0].id;
    await commerce.subscriptions.setSettings(ctx, { storeId, enabled: true, discountPercent: 15, intervals: ['WEEKLY', 'MONTHLY'] });
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('validates settings and interval', async () => {
    await expect(commerce.subscriptions.setSettings(ctx, { storeId, discountPercent: 150 })).rejects.toBeInstanceOf(ValidationError);
    await expect(
      commerce.subscriptions.create(ctx, { storeId, variantId, interval: 'YEARLY' as any, email: 'x@example.com' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('creates a subscription, defaulting the discount from store settings', async () => {
    const sub = await commerce.subscriptions.create(ctx, { storeId, variantId, quantity: 2, interval: 'MONTHLY', email: 'rae@example.com' });
    expect(sub.status).toBe('ACTIVE');
    expect(sub.discountPercent).toBe(15); // from settings
    expect(sub.quantity).toBe(2);
    expect(new Date(sub.nextBillingAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('generates a discounted order when due and advances the schedule', async () => {
    const sub = await commerce.subscriptions.create(ctx, {
      storeId,
      variantId,
      quantity: 1,
      interval: 'WEEKLY',
      email: 'due@example.com',
      startAt: new Date(Date.now() - 1000), // already due
      discountPercent: 20,
    });

    const res = await commerce.subscriptions.runDueSubscriptions({ now: new Date() });
    expect(res.orders).toBeGreaterThanOrEqual(1);

    // The generated order carries the 20% subscribe-and-save discount.
    const refreshed = await commerce.subscriptions.list(ctx, { storeId, customerId: undefined });
    const mine = refreshed.find((s) => s.id === sub.id)!;
    expect(mine.cyclesCompleted).toBe(1);
    expect(new Date(mine.nextBillingAt).getTime()).toBeGreaterThan(Date.now());
    expect(mine.lastOrderId).toBeTruthy();

    const order = await prisma.order.findUnique({ where: { id: mine.lastOrderId! } });
    expect(order?.discountMinor).toBe(20000); // 20% of ₹1000
    expect(order?.totalMinor).toBe(80000);

    // Idempotent: a second run for the same (already-billed) cycle creates no
    // duplicate order — the cycle was claimed by advancing nextBillingAt.
    const ordersForSub = () => prisma.order.count({ where: { storeId, customerId: order!.customerId } });
    const countBefore = await ordersForSub();
    const second = await commerce.subscriptions.runDueSubscriptions({ now: new Date() });
    expect(second.orders).toBe(0);
    expect(await ordersForSub()).toBe(countBefore);
  });

  it('run-billing is tenant-scoped (does not touch another tenant)', async () => {
    const other = await prisma.tenant.create({ data: { name: 'Other Subs' } });
    const otherStore = await commerce.stores.create({ tenantId: other.id }, { name: 'Other' });
    await commerce.integrations.configure({ tenantId: other.id }, { storeId: otherStore.id, provider: 'RAZORPAY', credentials: { webhookSecret: 's' } });
    const op = await commerce.products.create({ tenantId: other.id }, { storeId: otherStore.id, title: 'X', status: 'ACTIVE', variants: [{ priceMinor: 10000, inventory: 100 }] });
    await commerce.subscriptions.create({ tenantId: other.id }, { storeId: otherStore.id, variantId: op.variants[0].id, interval: 'WEEKLY', email: 'o@ex.com', startAt: new Date(Date.now() - 1000) });

    // Billing scoped to OUR tenant must not create an order for the other tenant.
    const otherBefore = await prisma.order.count({ where: { storeId: otherStore.id } });
    await commerce.subscriptions.runDueSubscriptions({ now: new Date(), tenantId: ctx.tenantId });
    expect(await prisma.order.count({ where: { storeId: otherStore.id } })).toBe(otherBefore);
    await prisma.tenant.delete({ where: { id: other.id } }).catch(() => undefined);
  });

  it('does not bill paused/cancelled subscriptions', async () => {
    const sub = await commerce.subscriptions.create(ctx, {
      storeId,
      variantId,
      interval: 'WEEKLY',
      email: 'paused@example.com',
      startAt: new Date(Date.now() - 1000),
    });
    await commerce.subscriptions.setStatus(ctx, sub.id, 'PAUSED');
    const before = await prisma.order.count({ where: { storeId } });
    await commerce.subscriptions.runDueSubscriptions({ now: new Date() });
    // The paused sub should not have produced an order (others may have none due).
    const cur = await commerce.subscriptions.list(ctx, { status: 'PAUSED' });
    expect(cur.find((s) => s.id === sub.id)?.cyclesCompleted).toBe(0);
    const after = await prisma.order.count({ where: { storeId } });
    expect(after).toBe(before);
  });

  it('lets a customer manage subscriptions by email and blocks cross-email access', async () => {
    const sub = await commerce.subscriptions.create(ctx, { storeId, variantId, interval: 'MONTHLY', email: 'self@example.com' });
    const mine = await commerce.subscriptions.listForEmail(storeId, 'SELF@example.com');
    expect(mine.find((s) => s.id === sub.id)).toBeTruthy();

    await commerce.subscriptions.manageByEmail(storeId, 'self@example.com', sub.id, 'CANCELLED');
    const after = await commerce.subscriptions.list(ctx, { customerId: undefined });
    expect(after.find((s) => s.id === sub.id)?.status).toBe('CANCELLED');

    // Wrong email cannot manage someone else's subscription.
    await expect(commerce.subscriptions.manageByEmail(storeId, 'other@example.com', sub.id, 'PAUSED')).rejects.toBeTruthy();
  });

  it('reports per-status counts', async () => {
    const counts = await commerce.subscriptions.counts(ctx, storeId);
    expect(counts.ACTIVE + counts.PAUSED + counts.CANCELLED).toBeGreaterThanOrEqual(4);
  });
});
