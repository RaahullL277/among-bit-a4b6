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

  it('hides unpublished policies from the storefront', async () => {
    await commerce.stores.create(ctx, { name: 'Draft Shop' });
    const store = (await commerce.stores.list(ctx)).find((s) => s.name === 'Draft Shop')!;
    await commerce.legal.generate(ctx, store.id, 'PRIVACY'); // draft, not published
    const published = await commerce.legal.publicList(store.id);
    expect(published).toHaveLength(0);
    expect(await commerce.legal.publicGet(store.id, 'privacy')).toBeNull();
  });
});
