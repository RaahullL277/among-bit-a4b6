import { writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';

/**
 * Seeds a demo tenant with an API key, a store, stubbed Razorpay + WhatsApp
 * integrations, sample products, and a customer. The raw API key is printed
 * once and written to `.acp-seed.json` at the repo root for local convenience.
 */
async function main() {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);

  const tenant = await prisma.tenant.create({ data: { name: 'Demo Merchant' } });
  const ctx = { tenantId: tenant.id };

  const apiKey = await commerce.apiKeys.create(ctx, { name: 'seed-key', scopes: ['*'] });

  const store = await commerce.stores.create(ctx, {
    name: 'Chai & Co',
    slug: 'chai-and-co',
    currency: 'INR',
    country: 'IN',
    ownerEmail: 'owner@chai.example',
    ownerPhone: '+919800000000',
  });

  await commerce.integrations.configure(ctx, {
    storeId: store.id,
    provider: 'RAZORPAY',
    credentials: { keyId: 'rzp_test_stub', keySecret: 'stub_secret', webhookSecret: 'stub_webhook_secret' },
  });
  await commerce.integrations.configure(ctx, {
    storeId: store.id,
    provider: 'WHATSAPP',
    credentials: { phoneNumberId: 'stub_phone', token: 'stub_token' },
  });
  // Notification channels (stubbed) so order events deliver in dev.
  await commerce.integrations.configure(ctx, {
    storeId: store.id,
    provider: 'RESEND',
    credentials: { apiKey: 'stub_resend', fromAddress: 'orders@chai.example' },
  });
  await commerce.integrations.configure(ctx, {
    storeId: store.id,
    provider: 'MSG91',
    credentials: { authKey: 'stub_msg91', senderId: 'CHAICO' },
  });

  const masala = await commerce.products.create(ctx, {
    title: 'Masala Chai (250g)',
    description: 'Loose-leaf spiced black tea blend.',
    status: 'ACTIVE',
    storeId: store.id,
    variants: [{ title: '250g', sku: 'CHAI-250', priceMinor: 24900, inventory: 100 }],
  });
  await commerce.products.create(ctx, {
    title: 'Green Tea (100g)',
    status: 'ACTIVE',
    storeId: store.id,
    variants: [{ title: '100g', sku: 'GREEN-100', priceMinor: 19900, inventory: 50 }],
  });

  const customer = await commerce.customers.create(ctx, {
    storeId: store.id,
    name: 'Asha Rao',
    email: 'asha@example.com',
    phone: '+919800000000',
  });

  const output = {
    tenantId: tenant.id,
    apiKey: apiKey.raw,
    storeId: store.id,
    storeSlug: store.slug,
    sampleVariantId: masala.variants[0].id,
    sampleCustomerId: customer.id,
  };
  writeFileSync(new URL('../../../.acp-seed.json', import.meta.url), JSON.stringify(output, null, 2));

  console.log('\n✅ Seed complete.\n');
  console.log('  API key (store this — shown once):', apiKey.raw);
  console.log('  Store id:                          ', store.id);
  console.log('  Sample variant id:                 ', masala.variants[0].id);
  console.log('  Details written to .acp-seed.json\n');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
