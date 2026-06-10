import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'node:path';

// Load env from the repo root first, then any package-local override.
config({ path: resolve(process.cwd(), '../../.env') });
config();

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { CoreExceptionFilter } from './common/exception.filter.js';

async function bootstrap() {
  // `rawBody: true` preserves the exact bytes needed for webhook HMAC checks.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  app.useGlobalFilters(new CoreExceptionFilter());

  // Allow the merchant admin UI (and other first-party clients) to call the API.
  // CORS_ORIGIN is a comma-separated allowlist. Fail closed in production: an
  // unset allowlist must NOT reflect every origin.
  const origins = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);
  if (!origins?.length && process.env.NODE_ENV === 'production') {
    throw new Error('CORS_ORIGIN must be set in production (refusing wildcard origin).');
  }
  app.enableCors({
    origin: origins?.length ? origins : true,
    allowedHeaders: ['content-type', 'x-api-key', 'authorization', 'x-webhook-signature', 'x-acp-client'],
  });

  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`🛒 ACP REST API listening on http://localhost:${port}`);
}

bootstrap();
