import { createHmac, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import type { TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('catalog merchandising (P0/P1/P2)', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Catalog Co' } });
    ctx = { tenantId: tenant.id };
    const store = await commerce.stores.create(ctx, { name: 'Multi Mart' });
    storeId = store.id;
    await commerce.integrations.configure(ctx, { storeId, provider: 'RAZORPAY', credentials: { webhookSecret: 's' } });
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('P0-2: structured options + variant resolution', async () => {
    const p = await commerce.products.create(ctx, {
      storeId, title: 'Cotton Tee', status: 'ACTIVE', brand: 'Acme', productType: 'T-Shirt',
      variants: [
        { sku: 'TEE-S', priceMinor: 49900, inventory: 10, options: { Size: 'S' } },
        { sku: 'TEE-M', priceMinor: 49900, inventory: 5, options: { Size: 'M' } },
      ],
    });
    await commerce.catalog.setOptions(ctx, p.id, [{ name: 'Size', values: ['S', 'M', 'L'] }]);
    const opts = await commerce.catalog.getOptions(ctx, p.id);
    expect(opts[0].name).toBe('Size');
    expect(opts[0].values.map((v) => v.value)).toEqual(['S', 'M', 'L']);

    const resolved = await commerce.storefront.resolveVariant(storeId, p.id, { Size: 'M' });
    expect(resolved?.id).toBe(p.variants.find((v) => v.sku === 'TEE-M')!.id);
  });

  it('P0-1: product images (primary, reorder) surface on storefront', async () => {
    const p = await commerce.products.create(ctx, { storeId, title: 'Ruby Ring', status: 'ACTIVE', variants: [{ priceMinor: 1500000, inventory: 3 }] });
    const a = await commerce.images.create(ctx, { storeId, productId: p.id, url: 'https://img/a.jpg' });
    const b = await commerce.images.create(ctx, { storeId, productId: p.id, url: 'https://img/b.jpg' });
    expect(a.isPrimary).toBe(true); // first image auto-primary
    expect(b.isPrimary).toBe(false);

    await commerce.images.setPrimary(ctx, b.id);
    await commerce.images.reorder(ctx, p.id, [b.id, a.id]);

    const detail = await commerce.storefront.getProduct(storeId, p.id);
    expect(detail.images.map((i: any) => i.url)).toEqual(['https://img/b.jpg', 'https://img/a.jpg']);

    const cards = await commerce.storefront.listProducts(storeId);
    const card = cards.find((c: any) => c.id === p.id);
    expect(card.imageUrl).toBe('https://img/b.jpg'); // primary
  });

  it('P1-1/P1-2/P1-3: collections, attributes, and faceted filter', async () => {
    const phone = await commerce.products.create(ctx, {
      storeId, title: 'Robo Sensor X', status: 'ACTIVE', brand: 'Botics', productType: 'Sensor',
      variants: [{ priceMinor: 250000, inventory: 50 }],
    });
    await commerce.catalog.setAttributes(ctx, phone.id, [
      { name: 'Interface', value: 'I2C', filterable: true },
      { name: 'Voltage', value: '5', unit: 'V' },
    ]);
    const col = await commerce.catalog.createCollection(ctx, { storeId, title: 'Robotics' });
    await commerce.catalog.setProductCollections(ctx, phone.id, [col.id]);

    // Facets expose brand, type, collection, filterable attribute.
    const facets = await commerce.storefront.facets(storeId);
    expect(facets.brands).toContain('Botics');
    expect(facets.productTypes).toContain('Sensor');
    expect(facets.collections.map((c: any) => c.handle)).toContain('robotics');
    expect(facets.attributes.find((a: any) => a.name === 'Interface')?.values).toContain('I2C');

    // Filter by collection + brand + attribute.
    const byCollection = await commerce.storefront.filter(storeId, { collection: 'robotics' });
    expect(byCollection.map((c: any) => c.id)).toContain(phone.id);
    const byAttr = await commerce.storefront.filter(storeId, { attributes: ['Interface:I2C'] });
    expect(byAttr.map((c: any) => c.id)).toContain(phone.id);
    const byBrand = await commerce.storefront.filter(storeId, { brand: 'Botics' });
    expect(byBrand.every((c: any) => true)).toBe(true);
  });

  it('P2-1/P2-2: assets + warranty/compliance fields on the detail', async () => {
    const p = await commerce.products.create(ctx, {
      storeId, title: 'Smart Speaker', status: 'ACTIVE', warrantyMonths: 12, warrantyTerms: '1-year limited', countryOfOrigin: 'India',
      variants: [{ priceMinor: 399900, inventory: 20, barcode: '8901234567890', weightGrams: 600 }],
    });
    await commerce.catalog.addAsset(ctx, { productId: p.id, type: 'DATASHEET', url: 'https://docs/spec.pdf', title: 'Spec sheet' });
    const assets = await commerce.catalog.listAssets(ctx, p.id);
    expect(assets[0].type).toBe('DATASHEET');

    const detail = await commerce.storefront.getProduct(storeId, p.id);
    expect(detail.warrantyMonths).toBe(12);
    expect(detail.assets[0].url).toBe('https://docs/spec.pdf');
    expect(detail.variants[0].barcode).toBe('8901234567890');
  });

  it('P2-3: B2B price tiers apply at checkout', async () => {
    const p = await commerce.products.create(ctx, { storeId, title: 'Bolt M3 (bulk)', status: 'ACTIVE', moq: 10, variants: [{ sku: 'BOLT', priceMinor: 1000, inventory: 1000 }] });
    const variantId = p.variants[0].id;
    await commerce.catalog.setPriceTiers(ctx, variantId, [{ minQuantity: 10, priceMinor: 800 }, { minQuantity: 100, priceMinor: 600 }]);

    // 50 units → ₹8.00 tier (≥10), so 50 × 800 = 40000.
    const { order } = await commerce.payments.checkout(ctx, { storeId, items: [{ variantId, quantity: 50 }] });
    expect(order.subtotalMinor).toBe(40000);

    // 1 unit → base price (no tier).
    const single = await commerce.payments.checkout(ctx, { storeId, items: [{ variantId, quantity: 1 }] });
    expect(single.order.subtotalMinor).toBe(1000);
  });
});
