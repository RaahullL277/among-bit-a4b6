import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module.js';
import { CoreExceptionFilter } from '../src/common/exception.filter.js';

const hasDb = Boolean(process.env.DATABASE_URL);

/**
 * The in-house IP rate limiter returns 429 once a route class's per-window
 * budget is exhausted. We tighten the public-read budget via env so the test
 * is fast and deterministic.
 */
describe.skipIf(!hasDb)('rate limiting', () => {
  let app: INestApplication;
  let http: any;

  beforeAll(async () => {
    process.env.RATE_LIMIT_PUBLIC = '5'; // read at request time by the middleware
    app = await NestFactory.create(AppModule, { logger: false });
    app.useGlobalFilters(new CoreExceptionFilter());
    await app.init();
    http = app.getHttpServer();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('429s a public endpoint past its budget, with rate-limit headers', async () => {
    const ip = '203.0.113.7'; // isolate this test's bucket
    const path = '/agent/nonexistent-store/manifest';
    let limited: any;
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await request(http).get(path).set('x-forwarded-for', ip);
      statuses.push(res.status);
      if (res.status === 429) { limited = res; break; }
    }
    // First 5 are allowed (not 429); the 6th is throttled.
    expect(statuses.slice(0, 5).every((s) => s !== 429)).toBe(true);
    expect(limited?.status).toBe(429);
    expect(limited?.headers['retry-after']).toBeDefined();
    expect(Number(limited?.headers['x-ratelimit-limit'])).toBe(5);
  });

  it('keeps separate budgets per IP', async () => {
    // A different IP is unaffected by the previous IP's exhausted bucket.
    const res = await request(http).get('/agent/nonexistent-store/manifest').set('x-forwarded-for', '203.0.113.99');
    expect(res.status).not.toBe(429);
  });
});
