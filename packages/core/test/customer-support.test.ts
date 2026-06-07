import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import type { TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('customer support chatbot (stub)', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    delete process.env.ANTHROPIC_API_KEY; // force the deterministic stub
    const tenant = await prisma.tenant.create({ data: { name: 'Support Co' } });
    ctx = { tenantId: tenant.id };
    const store = await commerce.stores.create(ctx, { name: 'Support Store' });
    storeId = store.id;
    await commerce.products.create(ctx, {
      storeId,
      title: 'Masala Chai',
      status: 'ACTIVE',
      variants: [{ priceMinor: 24900, inventory: 50 }],
    });
    const customer = await commerce.customers.create(ctx, { storeId, name: 'Riya', email: 'riya@example.com' });
    await prisma.order.create({
      data: { tenantId: ctx.tenantId, storeId, number: 1, customerId: customer.id, status: 'PAID', totalMinor: 24900 },
    });
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('answers a product question and starts a conversation', async () => {
    const res = await commerce.customerSupport.chat({ storeId, message: 'Do you have any chai?' });
    expect(res.provider).toBeUndefined(); // provider no longer leaked to the storefront
    expect(res.products.length).toBeGreaterThan(0); // rich suggestion cards
    expect(res.toolsUsed).toContain('search_products');
    expect(res.reply).toMatch(/Masala Chai/);
    expect(res.conversationId).toBeTruthy();
  });

  it('checks order status with contact verification across turns', async () => {
    const first = await commerce.customerSupport.chat({ storeId, message: 'where is my order?' });
    // Without an order number it asks for details (no tool call).
    expect(first.toolsUsed).toHaveLength(0);

    const second = await commerce.customerSupport.chat({
      storeId,
      conversationId: first.conversationId,
      message: 'order #1, email riya@example.com',
    });
    expect(second.toolsUsed).toContain('get_order_status');
    expect(second.reply).toMatch(/#1/);
    expect(second.reply).toMatch(/PAID/);
  });

  it('rejects an order lookup that fails verification', async () => {
    const res = await commerce.customerSupport.chat({ storeId, message: 'status of order #1 email wrong@example.com' });
    expect(res.toolsUsed).toContain('get_order_status');
    expect(res.reply).toMatch(/verify|confirm/i);
  });

  it('escalates to a human and surfaces in the merchant inbox', async () => {
    const res = await commerce.customerSupport.chat({
      storeId,
      message: 'I want to speak to a human about a refund',
      contact: { email: 'angry@example.com' },
    });
    expect(res.toolsUsed).toContain('escalate_to_human');
    expect(res.status).toBe('ESCALATED');

    const escalated = await commerce.customerSupport.listConversations(ctx, { storeId, status: 'ESCALATED' });
    expect(escalated.find((c) => c.id === res.conversationId)).toBeTruthy();

    // The store owner is notified the conversation needs a human.
    const notes = await commerce.notifications.listNotifications(ctx, storeId);
    expect(notes.some((n) => n.event === 'SUPPORT_ESCALATED' && n.recipientType === 'STORE_OWNER')).toBe(true);

    // Agent reply re-opens; resolve closes.
    const replied = await commerce.customerSupport.reply(ctx, res.conversationId, 'Hi, I can help with that refund.');
    expect(replied.status).toBe('OPEN');
    expect(replied.messages.some((m) => m.sender === 'AGENT')).toBe(true);
    const resolved = await commerce.customerSupport.setStatus(ctx, res.conversationId, 'RESOLVED');
    expect(resolved.status).toBe('RESOLVED');
  });

  it('respects a disabled bot in public config', async () => {
    await commerce.customerSupport.setConfig(ctx, { storeId, enabled: false });
    const cfg = await commerce.customerSupport.publicConfig(storeId);
    expect(cfg.enabled).toBe(false);
    await expect(commerce.customerSupport.chat({ storeId, message: 'hi' })).rejects.toThrow();
    await commerce.customerSupport.setConfig(ctx, { storeId, enabled: true });
  });

  it('P0-2: adds a variant to cart, returning an action + product cards', async () => {
    const res = await commerce.customerSupport.chat({ storeId, message: "I'll take the Masala Chai" });
    expect(res.toolsUsed).toContain('add_to_cart');
    expect(res.actions.some((a) => a.type === 'add_to_cart' && a.variantId)).toBe(true);
    expect(res.products.length).toBeGreaterThan(0);
  });

  it('P0-2: browses the catalog', async () => {
    const res = await commerce.customerSupport.chat({ storeId, message: 'what do you sell?' });
    expect(res.toolsUsed).toContain('browse_catalog');
    expect(res.products.length).toBeGreaterThan(0);
  });

  it('P1-4: answers a policy question from real store data', async () => {
    await commerce.returns.setPolicy(ctx, { storeId, returnWindowDays: 21 });
    const res = await commerce.customerSupport.chat({ storeId, message: "what's your return policy?" });
    expect(res.toolsUsed).toContain('get_policies');
    expect(res.reply).toMatch(/21 days/);
  });

  it('P0-3: an agent reply emails the customer (consent trail closed)', async () => {
    const started = await commerce.customerSupport.chat({ storeId, message: 'hi there', contact: { name: 'Sam', email: 'sam@example.com' } });
    await commerce.customerSupport.reply(ctx, started.conversationId, 'Thanks for reaching out — here is the info.');
    const notes = await commerce.notifications.listNotifications(ctx, storeId);
    expect(notes.some((n) => n.event === 'SUPPORT_AGENT_REPLY' && n.recipientType === 'CUSTOMER')).toBe(true);
  });

  it('P0-1/P2-9: config reports LLM mode + bot analytics', async () => {
    const cfg = await commerce.customerSupport.getConfig(ctx, storeId);
    expect(cfg.llmActive).toBe(false); // stub mode in tests

    const stats = await commerce.customerSupport.botAnalytics(ctx, storeId);
    expect(stats.conversations).toBeGreaterThan(0);
    expect(stats.deflectionRate + stats.escalationRate).toBe(100);
    expect(stats.topTools.length).toBeGreaterThan(0);
  });

  it('P2-8: inbound WhatsApp is answered by the real bot (not an echo)', async () => {
    await commerce.integrations.configure(ctx, { storeId, provider: 'WHATSAPP', credentials: { phoneNumberId: 'p', token: 't' } });
    const res = await commerce.messaging.handleInbound(ctx, storeId, JSON.stringify({ from: '+919812345678', body: 'do you have chai?' }));
    expect(res.reply).not.toMatch(/team member will reply/i);
    expect(res.reply).toMatch(/Masala Chai|options|selection/i);
  });
});
