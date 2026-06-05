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

  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`🛒 ACP REST API listening on http://localhost:${port}`);
}

bootstrap();
