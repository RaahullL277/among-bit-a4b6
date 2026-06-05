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
  // CORS_ORIGIN can be a comma-separated allowlist; defaults to all origins in dev.
  const origins = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim());
  app.enableCors({
    origin: origins && origins.length ? origins : true,
    allowedHeaders: ['content-type', 'x-api-key', 'authorization', 'x-webhook-signature'],
  });

  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`🛒 ACP REST API listening on http://localhost:${port}`);
}

bootstrap();
