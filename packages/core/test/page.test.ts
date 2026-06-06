import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { ValidationError, type TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('page builder + theme', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;
  let productId: string;

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Design Co' } });
    ctx = { tenantId: tenant.id };
    const store = await commerce.stores.create(ctx, { name: 'Design Store' });
    storeId = store.id;
    const product = await commerce.products.create(ctx, {
      storeId,
      title: 'Lamp',
      status: 'ACTIVE',
      variants: [{ priceMinor: 50000, inventory: 10 }],
    });
    productId = product.id;
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('validates slug and section types', async () => {
    await expect(
      commerce.pages.create(ctx, { storeId, slug: 'Bad Slug', title: 'X' }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      commerce.pages.create(ctx, { storeId, slug: 'home', title: 'Home', sections: [{ id: 'a', type: 'nope' as any, data: {} }] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('creates a draft page that is not rendered publicly until published', async () => {
    const page = await commerce.pages.create(ctx, {
      storeId,
      slug: 'home',
      title: 'Welcome',
      sections: [
        { id: 's1', type: 'hero', data: { heading: 'Hello', subheading: 'Shop now' } },
        { id: 's2', type: 'product_grid', data: { title: 'All', mode: 'all' } },
      ],
    });
    expect(page.status).toBe('DRAFT');

    // Draft → not visible publicly.
    expect(await commerce.pages.renderPage(storeId, 'home')).toBeNull();

    await commerce.pages.setStatus(ctx, page.id, 'PUBLISHED');
    const rendered = await commerce.pages.renderPage(storeId, 'home');
    expect(rendered?.title).toBe('Welcome');
    expect(rendered?.sections).toHaveLength(2);
  });

  it('resolves product references in product_grid and featured_product', async () => {
    const page = await commerce.pages.create(ctx, {
      storeId,
      slug: 'shop',
      title: 'Shop',
      status: 'PUBLISHED',
      sections: [
        { id: 'g', type: 'product_grid', data: { mode: 'manual', productIds: [productId] } },
        { id: 'f', type: 'featured_product', data: { productId } },
      ],
    });
    expect(page.slug).toBe('shop');

    const rendered = await commerce.pages.renderPage(storeId, 'shop');
    const grid = rendered!.sections[0] as any;
    const featured = rendered!.sections[1] as any;
    expect(grid.products[0].id).toBe(productId);
    expect(grid.products[0].variant.priceMinor).toBe(50000);
    expect(featured.product.title).toBe('Lamp');
  });

  it('enforces unique slugs per store', async () => {
    await expect(
      commerce.pages.create(ctx, { storeId, slug: 'home', title: 'Dup' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('updates a page and lists pages', async () => {
    const pages = await commerce.pages.list(ctx, storeId);
    expect(pages.length).toBeGreaterThanOrEqual(2);
    const home = pages.find((p) => p.slug === 'home')!;
    const updated = await commerce.pages.update(ctx, home.id, { title: 'New title', metaTitle: 'SEO' });
    expect(updated.title).toBe('New title');
    expect(updated.metaTitle).toBe('SEO');
  });

  it('stores and validates the theme', async () => {
    const def = await commerce.pages.getTheme(ctx, storeId);
    expect(def.primaryColor).toBe('#1c1917');

    await expect(
      commerce.pages.setTheme(ctx, { storeId, primaryColor: 'red' }),
    ).rejects.toBeInstanceOf(ValidationError);

    const saved = await commerce.pages.setTheme(ctx, { storeId, primaryColor: '#000000', accentColor: '#ff8800', logoText: 'Design Co' });
    expect(saved.primaryColor).toBe('#000000');
    const pub = await commerce.pages.publicTheme(storeId);
    expect(pub.accentColor).toBe('#ff8800');
    expect(pub.logoText).toBe('Design Co');
  });

  it('deletes a page', async () => {
    const created = await commerce.pages.create(ctx, { storeId, slug: 'temp', title: 'Temp' });
    const res = await commerce.pages.remove(ctx, created.id);
    expect(res.deleted).toBe(true);
    await expect(commerce.pages.get(ctx, created.id)).rejects.toBeTruthy();
  });
});
