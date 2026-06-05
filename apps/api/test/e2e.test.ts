import 'reflect-metadata';
import { createHmac, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '@acp/core';
import { AppModule } from '../src/app.module.js';
import { CoreExceptionFilter } from '../src/common/exception.filter.js';

/**
 * End-to-end REST flow against a booted Nest app + real DB:
 * auth → create store → create product → checkout → signed webhook → order PAID.
 * Skips without DATABASE_URL.
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const WEBHOOK_SECRET = 'e2e_webhook_secret';

describe.skipIf(!hasDb)('REST e2e', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let http: any;
  let tenantId: string;
  let apiKey: string;
  let storeId: string;

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');

    const commerce = new Commerce(prisma);
    const tenant = await prisma.tenant.create({ data: { name: 'E2E' } });
    tenantId = tenant.id;
    apiKey = (await commerce.apiKeys.create({ tenantId }, { name: 'e2e' })).raw;
    const store = await commerce.stores.create({ tenantId }, { name: 'E2E Store' });
    storeId = store.id;
    await commerce.integrations.configure(
      { tenantId },
      { storeId, provider: 'RAZORPAY', credentials: { webhookSecret: WEBHOOK_SECRET } },
    );

    app = await NestFactory.create(AppModule, { rawBody: true, logger: false });
    app.useGlobalFilters(new CoreExceptionFilter());
    await app.init();
    http = app.getHttpServer();
  });

  afterAll(async () => {
    await app?.close();
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('serves health without auth', async () => {
    await request(http).get('/health').expect(200).expect({ status: 'ok', service: 'acp-api' });
  });

  it('rejects unauthenticated requests', async () => {
    await request(http).get('/stores').expect(401);
  });

  it('runs checkout → signed webhook → order becomes PAID', async () => {
    const product = await request(http)
      .post('/products')
      .set('x-api-key', apiKey)
      .send({
        storeId,
        title: 'Widget',
        status: 'ACTIVE',
        variants: [{ priceMinor: 15000, inventory: 10 }],
      })
      .expect(201);
    const variantId = product.body.variants[0].id;

    const checkout = await request(http)
      .post('/payments/checkout')
      .set('x-api-key', apiKey)
      .send({ storeId, items: [{ variantId, quantity: 3 }] })
      .expect(201);
    expect(checkout.body.order.status).toBe('PENDING');
    expect(checkout.body.order.totalMinor).toBe(45000);
    const { id: orderId, payment } = checkout.body.order;

    const body = JSON.stringify({
      event: 'payment.captured',
      providerRef: payment.providerRef,
      status: 'CAPTURED',
    });
    const signature = createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');

    const webhook = await request(http)
      .post('/webhooks/razorpay')
      .set('content-type', 'application/json')
      .set('x-webhook-signature', signature)
      .send(body)
      .expect(201);
    expect(webhook.body).toMatchObject({ routed: true, signatureValid: true });

    const order = await request(http).get(`/orders/${orderId}`).set('x-api-key', apiKey).expect(200);
    expect(order.body.status).toBe('PAID');
    expect(order.body.payment.status).toBe('CAPTURED');
  });

  it('ignores webhooks with a bad signature', async () => {
    const body = JSON.stringify({ event: 'payment.captured', providerRef: 'nope', status: 'CAPTURED' });
    const res = await request(http)
      .post('/webhooks/razorpay')
      .set('content-type', 'application/json')
      .set('x-webhook-signature', 'badsig')
      .send(body)
      .expect(201);
    expect(res.body.signatureValid).toBe(false);
  });
});
