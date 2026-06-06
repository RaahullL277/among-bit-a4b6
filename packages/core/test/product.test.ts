import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { NotFoundError, ValidationError, type TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('products & variants', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Prod Co' } });
    ctx = { tenantId: tenant.id };
    storeId = (await commerce.stores.create(ctx, { name: 'Prod Store' })).id;
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('rejects a compare-at below the selling price on create', async () => {
    await expect(
      commerce.products.create(ctx, { storeId, title: 'Bad', variants: [{ priceMinor: 1000, compareAtMinor: 800 }] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('edits an existing variant price / compare-at / title (with validation)', async () => {
    const p = await commerce.products.create(ctx, { storeId, title: 'Tee', status: 'ACTIVE', variants: [{ priceMinor: 50000, inventory: 5 }] });
    const vid = p.variants[0].id;

    const updated = await commerce.products.updateVariant(ctx, vid, { priceMinor: 45000, compareAtMinor: 60000, title: 'Large', sku: 'TEE-L' });
    expect(updated.priceMinor).toBe(45000);
    expect(updated.compareAtMinor).toBe(60000);
    expect(updated.title).toBe('Large');
    expect(updated.sku).toBe('TEE-L');

    // compare-at must stay ≥ price.
    await expect(commerce.products.updateVariant(ctx, vid, { compareAtMinor: 40000 })).rejects.toBeInstanceOf(ValidationError);
    await expect(commerce.products.updateVariant(ctx, vid, { priceMinor: -1 })).rejects.toBeInstanceOf(ValidationError);

    // Clearing the compare-at (null) removes the discount badge.
    const cleared = await commerce.products.updateVariant(ctx, vid, { compareAtMinor: null });
    expect(cleared.compareAtMinor).toBeNull();

    // Tenant scope: another tenant can't edit it.
    await expect(commerce.products.updateVariant({ tenantId: 'other' }, vid, { priceMinor: 1 })).rejects.toBeInstanceOf(NotFoundError);
  });
});
