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
  let variantId: string;

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Shop Co' } });
    ctx = { tenantId: tenant.id };
    const store = await commerce.stores.create(ctx, { name: 'Shop Store' });
    storeId = store.id;
    const product = await commerce.products.create(ctx, { storeId, title: 'Widget', status: 'ACTIVE', variants: [{ priceMinor: 49900, inventory: 5 }] });
    variantId = product.variants[0].id;
    // Payment provider so agent checkout can complete an order.
    await commerce.integrations.configure(ctx, { storeId, provider: 'RAZORPAY', credentials: { webhookSecret: 's' } });
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

    // An UNIDENTIFIED agent (no channel) is now blocked too — it can't sidestep
    // the per-assistant toggle by omitting its channel (CHATGPT is disabled).
    const anon = await commerce.shopability.manifest(storeId, null);
    expect(anon.shoppable).toBe(false);
    expect(anon.reason).toBe('channel_required');
    await expect(commerce.shopability.feed(storeId, null)).rejects.toBeInstanceOf(ForbiddenError);
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

  it('agent checkout requires a delegated-payment mandate that covers the cart', async () => {
    // Re-enable everything (a prior test left ChatGPT off / master toggled).
    await commerce.shopability.update(ctx, storeId, { enabled: true, enabledChannels: ['CLAUDE', 'CHATGPT', 'GEMINI', 'PERPLEXITY', 'COPILOT', 'META_AI'] });
    const newCart = () => commerce.storefront.createCart(storeId, { items: [{ variantId, quantity: 1 }] });

    // No mandate → rejected + audited.
    const c1 = await newCart();
    await expect(commerce.shopability.checkout(storeId, 'claude', c1.id, {})).rejects.toBeInstanceOf(ForbiddenError);

    // Mandate too small (cart is ₹499 = 49900) → rejected.
    const c2 = await newCart();
    await expect(
      commerce.shopability.checkout(storeId, 'claude', c2.id, { mandate: { ref: 'mnd_1', maxAmountMinor: 10000, currency: 'INR' } }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // Valid mandate → authorized order, attributed to the assistant.
    const c3 = await newCart();
    const res: any = await commerce.shopability.checkout(storeId, 'claude', c3.id, { mandate: { ref: 'mnd_ok', maxAmountMinor: 100000, currency: 'INR' }, email: 'buyer@ex.com' });
    expect(res.order?.id).toBeTruthy();
    expect(res.agentCheckout.channel).toBe('CLAUDE');
    expect(res.agentCheckout.mandateRef).toBe('mnd_ok');

    // The order itself carries the channel attribution.
    const order = await prisma.order.findUnique({ where: { id: res.order.id } });
    expect(order?.source).toBe('agent');
    expect(order?.agentChannel).toBe('CLAUDE');

    // Once paid, analytics attributes the revenue to the assistant.
    await prisma.order.update({ where: { id: res.order.id }, data: { status: 'PAID' } });
    const sales = await commerce.analytics.agentSales(ctx, { storeId });
    expect(sales.agentOrders).toBeGreaterThanOrEqual(1);
    expect(sales.agentRevenueMinor).toBeGreaterThan(0);
    expect(sales.byChannel.some((c) => c.channel === 'CLAUDE')).toBe(true);

    // A disabled assistant is blocked before any mandate check.
    await commerce.shopability.setChannel(ctx, storeId, 'CHATGPT', false);
    const c4 = await newCart();
    await expect(
      commerce.shopability.checkout(storeId, 'chatgpt', c4.id, { mandate: { ref: 'm', maxAmountMinor: 100000, currency: 'INR' } }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // Audit log captures both AUTHORIZED and REJECTED with the assistant + reason.
    const log = await commerce.shopability.checkoutLog(ctx, storeId);
    expect(log.some((r) => r.status === 'AUTHORIZED' && r.channel === 'CLAUDE')).toBe(true);
    expect(log.some((r) => r.status === 'REJECTED' && r.reason === 'missing_payment_mandate')).toBe(true);
    expect(log.some((r) => r.reason === 'mandate_insufficient')).toBe(true);
  });
});
