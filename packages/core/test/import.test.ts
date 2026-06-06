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
});
