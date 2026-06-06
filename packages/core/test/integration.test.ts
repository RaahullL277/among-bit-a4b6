import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { NotFoundError, type TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('integrations (encrypted, per-store providers)', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Integ Co' } });
    ctx = { tenantId: tenant.id };
    storeId = (await commerce.stores.create(ctx, { name: 'Integ Store' })).id;
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('configures a provider without leaking credentials, and round-trips them internally', async () => {
    const res = await commerce.integrations.configure(ctx, { storeId, provider: 'RAZORPAY', credentials: { webhookSecret: 'shh', keyId: 'k1' } });
    expect(res).not.toHaveProperty('config');
    expect(res.provider).toBe('RAZORPAY');
    expect(res.kind).toBe('PAYMENT');

    const list = await commerce.integrations.list(ctx, storeId);
    expect(list.some((r) => r.provider === 'RAZORPAY' && r.enabled)).toBe(true);
    // list also never exposes raw credentials.
    expect(JSON.stringify(list)).not.toContain('shh');

    // Internal resolution decrypts for adapter construction.
    const creds = await commerce.integrations.getCredentials(ctx, storeId, 'RAZORPAY');
    expect(creds.webhookSecret).toBe('shh');
    expect(await commerce.integrations.getActivePaymentProvider(ctx, storeId)).toBe('RAZORPAY');
  });

  it('is tenant-isolated and errors for unconfigured providers', async () => {
    const other = await prisma.tenant.create({ data: { name: 'Other' } });
    await expect(commerce.integrations.getCredentials({ tenantId: other.id }, storeId, 'RAZORPAY')).rejects.toBeInstanceOf(NotFoundError);
    await expect(commerce.integrations.getCredentials(ctx, storeId, 'DELHIVERY')).rejects.toBeInstanceOf(NotFoundError);
    await prisma.tenant.delete({ where: { id: other.id } }).catch(() => undefined);
  });
});

describe.skipIf(!hasDb)('image optimization', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Img Co' } });
    ctx = { tenantId: tenant.id };
    storeId = (await commerce.stores.create(ctx, { name: 'Img Store' })).id;
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('optimizes images, reports savings, and manages alt text', async () => {
    await commerce.images.create(ctx, { storeId, url: 'https://x/a.jpg', originalBytes: 100_000 });
    const b = await commerce.images.create(ctx, { storeId, url: 'https://x/b.jpg', originalBytes: 50_000, alt: 'has alt' });

    let savings = await commerce.images.savings(ctx, storeId);
    expect(savings.total).toBe(2);
    expect(savings.pending).toBe(2);
    expect(savings.missingAlt).toBe(1); // only a.jpg lacks alt

    const run = await commerce.images.optimizeAll(ctx, storeId);
    expect(run.optimized).toBe(2);
    expect(run.savedBytes).toBeGreaterThan(0);

    savings = await commerce.images.savings(ctx, storeId);
    expect(savings.optimized).toBe(2);
    expect(savings.currentBytes).toBeLessThan(savings.originalBytes);

    // Optimizing again is a no-op (idempotent).
    const again = await commerce.images.optimizeAll(ctx, storeId);
    expect(again.optimized).toBe(0);

    const withAlt = await commerce.images.setAlt(ctx, b.id, 'a nicer description');
    expect(withAlt.alt).toBe('a nicer description');
  });
});
