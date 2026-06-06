import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { ValidationError, type TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('reviews', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;
  let productId: string;
  let variantId: string;

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Rev Co' } });
    ctx = { tenantId: tenant.id };
    const store = await commerce.stores.create(ctx, { name: 'Rev Store' });
    storeId = store.id;
    const product = await commerce.products.create(ctx, {
      storeId,
      title: 'Kettle',
      status: 'ACTIVE',
      variants: [{ priceMinor: 80000, inventory: 5 }],
    });
    productId = product.id;
    variantId = product.variants[0].id;
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('rejects an out-of-range rating', async () => {
    await expect(
      commerce.reviews.submit({ storeId, productId, rating: 6, authorName: 'X' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('submits a pending review and hides it until approved', async () => {
    const r = await commerce.reviews.submit({ storeId, productId, rating: 5, authorName: 'Asha', title: 'Great', body: 'Love it' });
    expect(r.status).toBe('PENDING');

    // Not visible publicly while pending.
    const before = await commerce.reviews.listForProduct(storeId, productId);
    expect(before.summary.count).toBe(0);

    await commerce.reviews.moderate(ctx, r.id, 'APPROVED');
    const after = await commerce.reviews.listForProduct(storeId, productId);
    expect(after.summary.count).toBe(1);
    expect(after.summary.average).toBe(5);
    expect(after.reviews[0].title).toBe('Great');
  });

  it('marks a review verified when tied to a real paid order', async () => {
    const customer = await commerce.customers.create(ctx, { storeId, name: 'Riya', email: 'riya@example.com' });
    await prisma.order.create({
      data: {
        tenantId: ctx.tenantId,
        storeId,
        number: 1,
        customerId: customer.id,
        status: 'PAID',
        totalMinor: 80000,
        items: { create: [{ tenantId: ctx.tenantId, variantId, title: 'Kettle', quantity: 1, unitPriceMinor: 80000 }] },
      },
    });
    const r = await commerce.reviews.submit({
      storeId,
      productId,
      rating: 4,
      authorName: 'Riya',
      orderNumber: 1,
      orderEmail: 'riya@example.com',
    });
    expect(r.verified).toBe(true);

    // Wrong email → not verified.
    const r2 = await commerce.reviews.submit({ storeId, productId, rating: 3, authorName: 'X', orderNumber: 1, orderEmail: 'wrong@example.com' });
    expect(r2.verified).toBe(false);
  });

  it('aggregates ratings per product and supports merchant reply + counts', async () => {
    const summaries = await commerce.reviews.summariesForStore(storeId);
    expect(summaries[productId].count).toBeGreaterThanOrEqual(1);

    const pending = await commerce.reviews.list(ctx, { storeId, status: 'PENDING' });
    expect(pending.length).toBeGreaterThanOrEqual(1);
    const replied = await commerce.reviews.reply(ctx, pending[0].id, 'Thanks for the feedback!');
    expect(replied.merchantReply).toMatch(/Thanks/);

    const counts = await commerce.reviews.counts(ctx, storeId);
    expect(counts.PENDING + counts.APPROVED + counts.REJECTED).toBeGreaterThanOrEqual(3);
  });
});
