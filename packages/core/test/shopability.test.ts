import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { ForbiddenError, type TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('shopability (AI-assistant commerce)', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Shop Co' } });
    ctx = { tenantId: tenant.id };
    const store = await commerce.stores.create(ctx, { name: 'Shop Store' });
    storeId = store.id;
    await commerce.products.create(ctx, { storeId, title: 'Widget', status: 'ACTIVE', variants: [{ priceMinor: 49900, inventory: 5 }] });
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('defaults to shoppable on every assistant', async () => {
    const cfg = await commerce.shopability.get(ctx, storeId);
    expect(cfg.enabled).toBe(true);
    expect(cfg.isDefault).toBe(true);
    expect(cfg.channels).toHaveLength(6);
    expect(cfg.channels.every((c) => c.enabled)).toBe(true);
  });

  it('serves a manifest + feed when shoppable', async () => {
    const manifest = await commerce.shopability.manifest(storeId, 'chatgpt');
    expect(manifest.shoppable).toBe(true);
    expect(manifest.requestedChannel).toBe('CHATGPT');
    expect(manifest.endpoints.feed).toContain('/feed');
    const feed = await commerce.shopability.feed(storeId, 'claude');
    expect(feed.count).toBe(1);
    expect(feed.products[0].availability).toBe('in_stock');
  });

  it('disabling one assistant blocks only that assistant', async () => {
    await commerce.shopability.setChannel(ctx, storeId, 'CHATGPT', false);
    const cfg = await commerce.shopability.get(ctx, storeId);
    expect(cfg.channels.find((c) => c.channel === 'CHATGPT')!.enabled).toBe(false);
    expect(cfg.channels.find((c) => c.channel === 'CLAUDE')!.enabled).toBe(true);

    // ChatGPT is blocked…
    const gptManifest = await commerce.shopability.manifest(storeId, 'chatgpt');
    expect(gptManifest.shoppable).toBe(false);
    await expect(commerce.shopability.feed(storeId, 'chatgpt')).rejects.toBeInstanceOf(ForbiddenError);
    // …Claude still shops.
    const claude = await commerce.shopability.manifest(storeId, 'claude');
    expect(claude.shoppable).toBe(true);
    await expect(commerce.shopability.feed(storeId, 'claude')).resolves.toBeTruthy();
  });

  it('master switch disables all assistants', async () => {
    await commerce.shopability.setEnabled(ctx, storeId, false);
    const cfg = await commerce.shopability.get(ctx, storeId);
    expect(cfg.enabled).toBe(false);
    expect(cfg.channels.every((c) => c.enabled === false)).toBe(true);

    const manifest = await commerce.shopability.manifest(storeId, 'claude');
    expect(manifest.shoppable).toBe(false);
    expect(manifest.reason).toBe('shopability_disabled');
    await expect(commerce.shopability.feed(storeId, 'claude')).rejects.toBeInstanceOf(ForbiddenError);
    await expect(commerce.shopability.assertShoppable(storeId, null)).rejects.toBeInstanceOf(ForbiddenError);

    // Re-enable restores the previously-allowed set (ChatGPT stays off).
    await commerce.shopability.setEnabled(ctx, storeId, true);
    const reCfg = await commerce.shopability.get(ctx, storeId);
    expect(reCfg.enabled).toBe(true);
    expect(reCfg.channels.find((c) => c.channel === 'CHATGPT')!.enabled).toBe(false);
    expect(reCfg.channels.find((c) => c.channel === 'GEMINI')!.enabled).toBe(true);
  });

  it('resolves assistant aliases', () => {
    expect(commerce.shopability.resolveChannel('openai')).toBe('CHATGPT');
    expect(commerce.shopability.resolveChannel('google')).toBe('GEMINI');
    expect(commerce.shopability.resolveChannel('anthropic')).toBe('CLAUDE');
    expect(commerce.shopability.resolveChannel('unknown-bot')).toBeNull();
  });
});
