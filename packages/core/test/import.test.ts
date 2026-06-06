import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import type { TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

// Minimal but realistic export fixtures.
const SHOPIFY_CSV = `Handle,Title,Body (HTML),Vendor,Published,Option1 Name,Option1 Value,Variant SKU,Variant Price,Variant Compare At Price,Variant Inventory Qty
turmeric-200g,Turmeric 200g,Pure Salem turmeric,Spice Co,TRUE,Size,200g,TUR-200,180.00,220.00,40
turmeric-200g,,,,,Size,500g,TUR-500,400.00,,25
cardamom-100g,Cardamom 100g,Green cardamom,Spice Co,TRUE,Title,Default,CARD-100,350.00,,15`;

const WOO_CSV = `Type,SKU,Name,Published,Regular price,Sale price,Description,Stock
simple,WOO-1,Chilli Powder,1,120,99,Hot,30
simple,WOO-2,Coriander Seeds,1,80,,Whole,50`;

const DUKAAN_CSV = `Name,Description,Price,Discounted Price,Quantity,SKU,Status
Garam Masala,Blend of spices,300,249,20,GM-1,active
Bay Leaves,Aromatic,100,,10,BAY-1,active`;

const CUSTOMERS_CSV = `First Name,Last Name,Email,Phone
Asha,Rao,asha@example.com,+919812345678
Vijay,Kumar,vijay@example.com,`;

describe.skipIf(!hasDb)('store migration / import', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;

  async function freshStore(name: string) {
    const store = await commerce.stores.create(ctx, { name: `${name}-${randomBytes(3).toString('hex')}` });
    return store.id;
  }

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Migrate Co' } });
    ctx = { tenantId: tenant.id };
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('imports a Shopify product CSV, grouping variants by handle', async () => {
    const storeId = await freshStore('shopify');
    const job = await commerce.imports.run(ctx, { storeId, source: 'SHOPIFY', data: SHOPIFY_CSV });
    expect(job.status).toBe('COMPLETED');
    expect(job.productsCreated).toBe(2); // turmeric (2 variants) + cardamom
    const products = await commerce.products.list(ctx, storeId);
    const turmeric = products.find((p) => p.title === 'Turmeric 200g')!;
    expect(turmeric.variants).toHaveLength(2);
    expect(turmeric.variants.map((v) => v.sku).sort()).toEqual(['TUR-200', 'TUR-500']);
    // ₹180.00 → 18000 paise; compare-at preserved.
    const v200 = turmeric.variants.find((v) => v.sku === 'TUR-200')!;
    expect(v200.priceMinor).toBe(18000);
    expect(v200.compareAtMinor).toBe(22000);
    expect(v200.inventory).toBe(40);
  });

  it('is idempotent — re-running skips already-imported products', async () => {
    const storeId = await freshStore('idem');
    await commerce.imports.run(ctx, { storeId, source: 'SHOPIFY', data: SHOPIFY_CSV });
    const second = await commerce.imports.run(ctx, { storeId, source: 'SHOPIFY', data: SHOPIFY_CSV });
    expect(second.productsCreated).toBe(0);
    expect(second.productsSkipped).toBe(2);
    expect((await commerce.products.list(ctx, storeId)).length).toBe(2);
  });

  it('previews with dryRun without writing', async () => {
    const storeId = await freshStore('dry');
    const job = await commerce.imports.run(ctx, { storeId, source: 'DUKAAN', data: DUKAAN_CSV, dryRun: true });
    expect(job.dryRun).toBe(true);
    expect(job.productsCreated).toBe(2);
    expect((await commerce.products.list(ctx, storeId)).length).toBe(0); // nothing written
  });

  it('imports WooCommerce and Dukaan CSVs', async () => {
    const woo = await freshStore('woo');
    const wj = await commerce.imports.run(ctx, { storeId: woo, source: 'WOOCOMMERCE', data: WOO_CSV });
    expect(wj.productsCreated).toBe(2);
    const chilli = (await commerce.products.list(ctx, woo)).find((p) => p.title === 'Chilli Powder')!;
    expect(chilli.variants[0].priceMinor).toBe(9900); // sale price 99.00

    const duk = await freshStore('dukaan');
    const dj = await commerce.imports.run(ctx, { storeId: duk, source: 'DUKAAN', data: DUKAAN_CSV });
    expect(dj.productsCreated).toBe(2);
    const gm = (await commerce.products.list(ctx, duk)).find((p) => p.title === 'Garam Masala')!;
    expect(gm.variants[0].priceMinor).toBe(24900); // discounted 249.00
  });

  it('imports customers from a CSV (skips duplicates by email)', async () => {
    const storeId = await freshStore('cust');
    const job = await commerce.imports.run(ctx, { storeId, source: 'SHOPIFY', kind: 'customers', data: CUSTOMERS_CSV });
    expect(job.customersCreated).toBe(2);
    const again = await commerce.imports.run(ctx, { storeId, source: 'SHOPIFY', kind: 'customers', data: CUSTOMERS_CSV });
    expect(again.customersSkipped).toBe(2); // both have emails → both skipped on re-run
    expect(again.customersCreated).toBe(0);
  });

  it('imports the platform\'s own JSON shape', async () => {
    const storeId = await freshStore('json');
    const json = JSON.stringify([{ title: 'Saffron 1g', priceMinor: 50000, inventory: 5 }]);
    const job = await commerce.imports.run(ctx, { storeId, source: 'GENERIC', data: json });
    expect(job.productsCreated).toBe(1);
    const p = (await commerce.products.list(ctx, storeId))[0];
    expect(p.variants[0].priceMinor).toBe(50000);
  });

  it('imports historical orders, linking line items to variants by SKU', async () => {
    const storeId = await freshStore('orders');
    // A product with a matching SKU so the order line links to a real variant.
    await commerce.products.create(ctx, { storeId, status: 'ACTIVE', title: 'Turmeric 200g', variants: [{ sku: 'TUR-200', priceMinor: 9000, inventory: 100 }] });
    const ORDERS_CSV = `Name,Email,Financial Status,Created at,Total,Lineitem quantity,Lineitem name,Lineitem price,Lineitem sku
#1001,asha@example.com,paid,2024-01-15,236.00,2,Turmeric 200g,90.00,TUR-200
#1001,,,,,1,Cardamom 100g,56.00,
#1002,vijay@example.com,refunded,2024-02-01,99.00,1,Chilli,99.00,`;
    const job = await commerce.imports.run(ctx, { storeId, source: 'SHOPIFY', kind: 'orders', data: ORDERS_CSV });
    expect(job.productsCreated).toBe(2);
    const orders = await commerce.orders.list(ctx, storeId);
    const o1 = orders.find((o) => o.number != null && o.items?.length === 2)!;
    expect(o1.totalMinor).toBe(23600);
    expect(o1.status).toBe('PAID');
    const turmericLine = o1.items.find((i) => i.title === 'Turmeric 200g')!;
    expect(turmericLine.variantId).toBeTruthy(); // linked by SKU
    expect(orders.find((o) => o.status === 'REFUNDED')).toBeTruthy();

    // Idempotent by sourceRef.
    const again = await commerce.imports.run(ctx, { storeId, source: 'SHOPIFY', kind: 'orders', data: ORDERS_CSV });
    expect(again.productsSkipped).toBe(2);
  });

  it('applies an inventory sheet to existing variants by SKU', async () => {
    const storeId = await freshStore('inv');
    const p = await commerce.products.create(ctx, { storeId, status: 'ACTIVE', title: 'Pepper', variants: [{ sku: 'PEP-1', priceMinor: 5000, inventory: 3 }] });
    const job = await commerce.imports.run(ctx, { storeId, source: 'GENERIC', kind: 'inventory', data: 'sku,quantity\nPEP-1,42\nGHOST-9,10' });
    expect(job.productsCreated).toBe(1); // PEP-1 updated
    expect(job.productsSkipped).toBe(1); // GHOST-9 not found
    const refreshed = await commerce.products.get(ctx, p.id);
    expect(refreshed.variants[0].inventory).toBe(42);
  });

  it('updates existing products when updateExisting is set', async () => {
    const storeId = await freshStore('upd');
    const p = await commerce.products.create(ctx, { storeId, status: 'ACTIVE', title: 'Clove', variants: [{ sku: 'CLV-1', priceMinor: 5000, inventory: 1 }] });
    const data = JSON.stringify([{ title: 'Clove', variants: [{ sku: 'CLV-1', priceMinor: 7500, inventory: 25 }] }]);
    const job = await commerce.imports.run(ctx, { storeId, source: 'GENERIC', data, updateExisting: true });
    const refreshed = await commerce.products.get(ctx, p.id);
    expect(refreshed.variants[0].priceMinor).toBe(7500);
    expect(refreshed.variants[0].inventory).toBe(25);
    expect((job.report as any[]).some((r) => r.status === 'updated')).toBe(true);
  });

  it('pulls live from a (mocked) Shopify Admin API', async () => {
    const storeId = await freshStore('api-shopify');
    const fakeFetch = async (url: any) => ({
      ok: true,
      json: async () =>
        String(url).includes('/products.json')
          ? { products: [{ title: 'API Saffron', status: 'active', variants: [{ sku: 'API-1', price: '12.00', inventory_quantity: 3 }] }] }
          : { products: [] },
    });
    const job = await commerce.imports.runFromApi(ctx, { storeId, source: 'SHOPIFY', credentials: { shop: 'demo', accessToken: 'tok' } }, fakeFetch);
    expect(job.status).toBe('COMPLETED');
    expect(job.productsCreated).toBe(1);
    const p = (await commerce.products.list(ctx, storeId))[0];
    expect(p.title).toBe('API Saffron');
    expect(p.variants[0].priceMinor).toBe(1200);
  });

  it('pulls live from a (mocked) WooCommerce REST API', async () => {
    const storeId = await freshStore('api-woo');
    const fakeFetch = async (url: any) => ({
      ok: true,
      json: async () =>
        String(url).includes('/products')
          ? [{ name: 'Woo Chilli', status: 'publish', sku: 'WOO-9', price: '8.50', stock_quantity: 12 }]
          : [],
    });
    const job = await commerce.imports.runFromApi(ctx, { storeId, source: 'WOOCOMMERCE', credentials: { url: 'https://shop.example', consumerKey: 'ck', consumerSecret: 'cs' } }, fakeFetch);
    expect(job.productsCreated).toBe(1);
    const p = (await commerce.products.list(ctx, storeId))[0];
    expect(p.variants[0].priceMinor).toBe(850);
  });
});
