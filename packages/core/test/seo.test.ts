import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { ValidationError, type TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('SEO & image optimization', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;
  let productId: string;

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Seo Co' } });
    ctx = { tenantId: tenant.id };
    const store = await commerce.stores.create(ctx, { name: 'Seo Store' });
    storeId = store.id;
    const product = await commerce.products.create(ctx, {
      storeId,
      title: 'Hat', // short title, no description, no meta → issues
      status: 'ACTIVE',
      variants: [{ priceMinor: 50000, inventory: 5 }],
    });
    productId = product.id;
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('flags on-page SEO issues and scores the store', async () => {
    const audit = await commerce.seo.audit(ctx, storeId);
    expect(audit.score).toBeLessThan(100);
    const codes = audit.issues.filter((i) => i.entityType === 'product').map((i) => i.code);
    expect(codes).toContain('missing_meta_title');
    expect(codes).toContain('missing_description');
    expect(codes).toContain('no_images');
  });

  it('improves the score after fixing product meta', async () => {
    const before = (await commerce.seo.audit(ctx, storeId)).score;
    await commerce.products.update(ctx, productId, {
      metaTitle: 'Handmade Wool Hat for Winter — Warm & Cozy',
      metaDescription: 'A soft handmade wool hat that keeps you warm all winter. Ethically made, one size fits most, ships fast.',
    });
    const after = (await commerce.seo.audit(ctx, storeId)).score;
    expect(after).toBeGreaterThan(before);
  });

  it('validates the title template', async () => {
    await expect(commerce.seo.setSettings(ctx, { storeId, titleTemplate: 'no placeholder' })).rejects.toBeInstanceOf(ValidationError);
    const saved = await commerce.seo.setSettings(ctx, { storeId, titleTemplate: '{title} – {storeName}', indexable: true });
    expect(saved.titleTemplate).toContain('{title}');
  });

  it('renders product meta + Product JSON-LD', async () => {
    const meta = await commerce.seo.productMeta(storeId, productId);
    expect(meta?.title).toContain('Handmade Wool Hat');
    expect(meta?.jsonLd['@type']).toBe('Product');
    expect((meta?.jsonLd as any).offers.priceCurrency).toBe('INR');
  });

  it('generates a sitemap and robots.txt', async () => {
    const sitemap = await commerce.seo.sitemap(storeId);
    expect(sitemap).toContain('<urlset');
    expect(sitemap).toContain(`/product/${productId}`);

    const robots = await commerce.seo.robots(storeId);
    expect(robots).toContain('Sitemap:');

    await commerce.seo.setSettings(ctx, { storeId, indexable: false });
    expect(await commerce.seo.robots(storeId)).toContain('Disallow: /');
  });

  it('optimizes images, records savings, and generates alt text', async () => {
    const a = await commerce.images.create(ctx, { storeId, productId, url: 'https://img/1.jpg', originalBytes: 300_000 });
    await commerce.images.create(ctx, { storeId, productId, url: 'https://img/2.jpg', originalBytes: 100_000, alt: 'has alt' });

    const opt = await commerce.images.optimize(ctx, a.id);
    expect(opt.optimized).toBe(true);
    expect(opt.optimizedBytes!).toBeLessThan(300_000);

    const withAlt = await commerce.images.generateAlt(ctx, a.id);
    expect(withAlt.alt).toContain('Hat');

    const bulk = await commerce.images.optimizeAll(ctx, storeId);
    expect(bulk.optimized).toBeGreaterThanOrEqual(1); // the second image

    const savings = await commerce.images.savings(ctx, storeId);
    expect(savings.total).toBe(2);
    expect(savings.optimized).toBe(2);
    expect(savings.savedBytes).toBeGreaterThan(0);
  });
});
