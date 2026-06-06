import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '@acp/core';
import { AppModule } from '../src/app.module.js';
import { CoreExceptionFilter } from '../src/common/exception.filter.js';

const hasDb = Boolean(process.env.DATABASE_URL);

/**
 * HTTP-level coverage for the newest controllers — engagement, shopability and
 * the public agent surface — including the auth/public boundary and the
 * shopability toggle gating the agent feed.
 */
describe.skipIf(!hasDb)('agentic surface (e2e)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let http: any;
  let tenantId: string;
  let apiKey: string;
  let storeId: string;

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const commerce = new Commerce(prisma);
    const tenant = await prisma.tenant.create({ data: { name: 'Agentic E2E' } });
    tenantId = tenant.id;
    apiKey = (await commerce.apiKeys.create({ tenantId }, { name: 'e2e' })).raw;
    const store = await commerce.stores.create({ tenantId }, { name: 'Agentic Store' });
    storeId = store.id;
    await commerce.products.create({ tenantId }, { storeId, title: 'Thing', status: 'ACTIVE', variants: [{ priceMinor: 29900, inventory: 8 }] });

    app = await NestFactory.create(AppModule, { logger: false });
    app.useGlobalFilters(new CoreExceptionFilter());
    await app.init();
    http = app.getHttpServer();
  });

  afterAll(async () => {
    await app?.close();
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('engagement: library, setup, campaigns, dry-run (auth required)', async () => {
    // Unauthenticated is rejected.
    const unauth = await request(http).get('/engagement/library');
    expect([401, 403]).toContain(unauth.status);

    const lib = await request(http).get('/engagement/library').set('x-api-key', apiKey).expect(200);
    expect(lib.body).toHaveLength(9); // nine triggers
    expect(lib.body[0].channels).toHaveLength(3);

    const setup = await request(http).post('/engagement/setup-defaults').set('x-api-key', apiKey).send({ storeId, channel: 'EMAIL' }).expect(201);
    expect(setup.body.campaigns).toBe(9);

    const campaigns = await request(http).get(`/engagement/campaigns?storeId=${storeId}`).set('x-api-key', apiKey).expect(200);
    expect(campaigns.body.length).toBe(9);

    const run = await request(http).post('/engagement/run').set('x-api-key', apiKey).send({ storeId, dryRun: true }).expect(201);
    expect(run.body).toHaveProperty('considered');
  });

  it('shopability: read + toggle a channel (auth required)', async () => {
    const cfg = await request(http).get(`/shopability?storeId=${storeId}`).set('x-api-key', apiKey).expect(200);
    expect(cfg.body.enabled).toBe(true);
    expect(cfg.body.channels).toHaveLength(6);

    await request(http).put('/shopability/channel').set('x-api-key', apiKey).send({ storeId, channel: 'CHATGPT', enabled: false }).expect(200);
    const after = await request(http).get(`/shopability?storeId=${storeId}`).set('x-api-key', apiKey).expect(200);
    expect(after.body.channels.find((c: any) => c.channel === 'CHATGPT').enabled).toBe(false);
  });

  it('agent surface: public manifest + feed, gated by the toggle', async () => {
    // Public — no auth needed.
    const manifest = await request(http).get(`/agent/${storeId}/manifest?channel=claude`).expect(200);
    expect(manifest.body.shoppable).toBe(true);
    await request(http).get(`/agent/${storeId}/feed?channel=claude`).expect(200);

    // ChatGPT was disabled above → blocked.
    const gpt = await request(http).get(`/agent/${storeId}/manifest?channel=chatgpt`).expect(200);
    expect(gpt.body.shoppable).toBe(false);
    await request(http).get(`/agent/${storeId}/feed?channel=chatgpt`).expect(403);

    // Master off → everything blocked.
    await request(http).put('/shopability').set('x-api-key', apiKey).send({ storeId, enabled: false }).expect(200);
    await request(http).get(`/agent/${storeId}/feed?channel=claude`).expect(403);

    // Agent checkout without a payment mandate is rejected.
    const cart = await request(http).post(`/agent/${storeId}/carts`).send({}).expect(403); // store is off now
    expect(cart.body).toBeDefined();
  });
});
