import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { type TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('listing agent', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'List Co' } });
    ctx = { tenantId: tenant.id };
    storeId = (await commerce.stores.create(ctx, { name: 'List Store' })).id;
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('exposes a master prompt and customisable harness', async () => {
    const def = await commerce.listing.getConfig(ctx, storeId);
    expect(def.isDefault).toBe(true);
    expect(def.effectiveMasterPrompt).toContain('List Store'); // store name filled in

    const cfg = await commerce.listing.setConfig(ctx, { storeId, brandVoice: 'premium and refined', tone: 'luxurious', categoryHint: 'apparel', contentRules: ['mention free shipping'], masterPrompt: 'List for {{storeName}}. Voice: {{brandVoice}}.' });
    expect(cfg.isDefault).toBe(false);
    expect(cfg.brandVoice).toBe('premium and refined');
    expect(cfg.effectiveMasterPrompt).toBe('List for List Store. Voice: premium and refined.');
  });

  it('photo-enhancer sub-agent returns an enhanced URL + alt per prefs', async () => {
    const r = await commerce.listing.enhancePhoto(ctx, { storeId, imageUrl: 'https://img/x.jpg', hint: 'blue cotton kurta' });
    expect(r.enhancedUrl).toContain('enhanced=1');
    expect(r.enhancedUrl).toContain('bg=clean'); // background cleanup on by default
    expect(r.adjustments).toContain('background cleanup');
    expect(r.alt?.toLowerCase()).toContain('blue cotton kurta');
  });

  it('content-writer sub-agent honours brand voice in the copy + tags', async () => {
    const c = await commerce.listing.writeContent(ctx, { storeId, hint: 'silk saree', priceMinor: 250000 });
    expect(c.title.toLowerCase()).toContain('silk saree');
    expect(c.description.toLowerCase()).toMatch(/premium|refined|crafted/); // premium voice
    expect(c.tags).toContain('silk');
    expect(c.seoTitle).toContain('List Store');
    expect(c.bullets.length).toBeGreaterThanOrEqual(3);
  });

  it('drafts then publishes a real product with discount + photo', async () => {
    const draft = await commerce.listing.draft(ctx, { storeId, imageUrl: 'https://img/saree.jpg', hint: 'silk saree' });
    expect(draft.photo.enhancedUrl).toBeTruthy();
    expect(draft.content.title).toBeTruthy();

    const res = await commerce.listing.publish(ctx, {
      storeId,
      imageUrl: draft.photo.enhancedUrl,
      title: draft.content.title,
      description: draft.content.description,
      metaTitle: draft.content.seoTitle,
      metaDescription: draft.content.seoDescription,
      tags: draft.content.tags,
      alt: draft.photo.alt,
      priceMinor: 200000, // customer pays ₹2,000
      discountPercent: 20, // → "was" ₹2,500
      stock: 7,
      status: 'ACTIVE',
    });
    expect(res.priceMinor).toBe(200000);
    expect(res.compareAtMinor).toBe(250000); // 200000 / (1 - 0.20)
    expect(res.discountPercent).toBe(20);
    expect(res.imageId).toBeTruthy();

    // It's a real, live product the storefront can show, with the photo + tags.
    const product = await prisma.product.findUnique({ where: { id: res.product.id }, include: { variants: true, images: true } });
    expect(product?.status).toBe('ACTIVE');
    expect(product?.variants[0].compareAtMinor).toBe(250000);
    expect(product?.variants[0].inventory).toBe(7);
    expect(product?.tags).toContain('silk');
    expect(product?.images.length).toBe(1);
    expect(product?.images[0].optimized).toBe(true); // photo "enhanced"

    const onStore = await commerce.storefront.searchProducts(storeId, 'silk');
    expect(onStore.length).toBeGreaterThanOrEqual(1);
  });
});
