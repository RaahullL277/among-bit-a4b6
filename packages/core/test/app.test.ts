import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { NotFoundError, type TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('app marketplace', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Apps Co' } });
    ctx = { tenantId: tenant.id };
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('publishes a catalog and hides unpublished apps', async () => {
    await commerce.apps.seedCatalog();
    await commerce.apps.publish({ slug: 'apps-test-hidden', name: 'Hidden', published: false, scopes: [] });
    const catalog = await commerce.apps.catalog();
    expect(catalog.length).toBeGreaterThanOrEqual(4);
    expect(catalog.every((a) => a.published)).toBe(true);
    expect(catalog.some((a) => a.slug === 'apps-test-hidden')).toBe(false);
  });

  it('installs an app (granting its scopes), toggles, and uninstalls', async () => {
    const app = await commerce.apps.publish({ slug: 'apps-test-installable', name: 'Installable', scopes: ['products:read', 'orders:read'] });

    const install = await commerce.apps.install(ctx, 'apps-test-installable');
    expect(install.enabled).toBe(true);
    expect(install.scopes).toEqual(['products:read', 'orders:read']); // granted from the app's request

    let installed = await commerce.apps.listInstalled(ctx);
    expect(installed.some((i) => i.app.slug === 'apps-test-installable')).toBe(true);

    // Installing again is idempotent (no duplicate row).
    await commerce.apps.install(ctx, app.id);
    installed = await commerce.apps.listInstalled(ctx);
    expect(installed.filter((i) => i.app.slug === 'apps-test-installable').length).toBe(1);

    const disabled = await commerce.apps.setEnabled(ctx, 'apps-test-installable', false);
    expect(disabled.enabled).toBe(false);
    // Disabled apps drop out of the webhook subscriber set.
    expect(await commerce.apps.subscribersFor(ctx.tenantId, 'orders:read')).toHaveLength(0);
    await commerce.apps.setEnabled(ctx, 'apps-test-installable', true);
    expect(await commerce.apps.subscribersFor(ctx.tenantId, 'orders:read')).toHaveLength(1);

    const res = await commerce.apps.uninstall(ctx, 'apps-test-installable');
    expect(res.uninstalled).toBe(true);
    installed = await commerce.apps.listInstalled(ctx);
    expect(installed.some((i) => i.app.slug === 'apps-test-installable')).toBe(false);
  });

  it('rejects installing an unknown or unpublished app', async () => {
    await expect(commerce.apps.install(ctx, 'does-not-exist')).rejects.toBeInstanceOf(NotFoundError);
    await commerce.apps.publish({ slug: 'apps-test-draft', name: 'Draft', published: false, scopes: [] });
    await expect(commerce.apps.install(ctx, 'apps-test-draft')).rejects.toBeInstanceOf(NotFoundError);
  });
});
