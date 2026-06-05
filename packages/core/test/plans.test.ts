import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { ValidationError, type TenantContext } from '../src/context.js';
import type { PlatformContext } from '../src/platform/authz.js';

const hasDb = Boolean(process.env.DATABASE_URL);

const platformCtx: PlatformContext = {
  platformUserId: 'test-platform-user',
  actorEmail: 'billing@platform.test',
  role: 'BILLING',
  permissions: ['platform:billing:manage'],
};

describe.skipIf(!hasDb)('plans & limits', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Plan Test' } });
    ctx = { tenantId: tenant.id };
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('defaults to FREE and is unlimited until a plan is assigned', async () => {
    const plan = await commerce.platform.getPlan(ctx.tenantId);
    expect(plan.tier).toBe('FREE');
    expect(plan.isDefault).toBe(true);
    // No plan row yet → store creation is not limited.
    await commerce.stores.create(ctx, { name: 'S1' });
    await commerce.stores.create(ctx, { name: 'S2' });
  });

  it('enforces the store limit once a FREE plan is assigned', async () => {
    // Assign FREE with an explicit cap of 2 (already has 2 stores).
    await commerce.platform.setPlan(platformCtx, ctx.tenantId, { tier: 'FREE', storeLimit: 2 });
    await expect(commerce.stores.create(ctx, { name: 'S3' })).rejects.toBeInstanceOf(ValidationError);

    // Upgrade lifts the cap.
    const growth = await commerce.platform.setPlan(platformCtx, ctx.tenantId, { tier: 'GROWTH' });
    expect(growth.storeLimit).toBe(5);
    expect(growth.features).toContain('analytics');
    await commerce.stores.create(ctx, { name: 'S3' }); // now allowed

    // The plan change was audited.
    const audit = await commerce.platform.listAudit({ limit: 5 });
    expect(audit.find((a) => a.action === 'plan.update' && a.targetId === ctx.tenantId)).toBeTruthy();
  });

  it('ENTERPRISE is unlimited', async () => {
    const ent = await commerce.platform.setPlan(platformCtx, ctx.tenantId, { tier: 'ENTERPRISE' });
    expect(ent.storeLimit).toBeNull();
  });
});
