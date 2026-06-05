import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module.js';
import { CoreExceptionFilter } from '../src/common/exception.filter.js';

/**
 * HTTP-level auth + RBAC: passwordless signup issues a session, sessions
 * authenticate via Bearer, and @Permissions are enforced (a STAFF member is
 * forbidden from writing integrations but may read stores). Skips without a DB.
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('auth & RBAC (e2e)', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let http: any;
  const tenantIds: string[] = [];

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    app = await NestFactory.create(AppModule, { rawBody: true, logger: false });
    app.useGlobalFilters(new CoreExceptionFilter());
    await app.init();
    http = app.getHttpServer();
  });

  afterAll(async () => {
    await app?.close();
    if (tenantIds.length) await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { email: { contains: '@e2eauth.local' } } });
    await prisma.$disconnect();
  });

  it('signs up, authenticates sessions, and enforces role permissions', async () => {
    const ownerEmail = `owner+${Date.now()}@e2eauth.local`;
    const signup = await request(http)
      .post('/auth/signup')
      .send({ email: ownerEmail, tenantName: 'E2E Auth Co' })
      .expect(201);
    const ownerToken = signup.body.token;
    tenantIds.push(signup.body.tenantId);
    expect(signup.body.role).toBe('OWNER');

    // Unauthenticated → 401.
    await request(http).get('/stores').expect(401);

    // Owner session works and can write.
    const store = await request(http)
      .post('/stores')
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Auth Store' })
      .expect(201);

    // Invite a STAFF member and accept (token comes from the dev link).
    const invite = await request(http)
      .post('/invites')
      .set('authorization', `Bearer ${ownerToken}`)
      .send({ email: `staff+${Date.now()}@e2eauth.local`, role: 'STAFF' })
      .expect(201);
    const inviteToken = new URL(invite.body.devLink).searchParams.get('token');

    const accept = await request(http).post('/auth/accept-invite').send({ token: inviteToken }).expect(201);
    const staffToken = accept.body.token;
    expect(accept.body.role).toBe('STAFF');

    // STAFF can read stores...
    await request(http).get('/stores').set('authorization', `Bearer ${staffToken}`).expect(200);

    // ...but cannot configure integrations (403) or manage members (403).
    await request(http)
      .post('/integrations')
      .set('authorization', `Bearer ${staffToken}`)
      .send({ storeId: store.body.id, provider: 'RESEND', credentials: {} })
      .expect(403);
    await request(http).get('/members').set('authorization', `Bearer ${staffToken}`).expect(403);

    // /auth/me reflects the staff identity.
    const me = await request(http).get('/auth/me').set('authorization', `Bearer ${staffToken}`).expect(200);
    expect(me.body.role).toBe('STAFF');
  });
});
