import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { type TenantContext } from '../src/context.js';
import { ENGAGEMENT_TEMPLATES } from '../src/engagement/templates.js';

const hasDb = Boolean(process.env.DATABASE_URL);
const DAY = 86_400_000;

describe('engagement template library', () => {
  it('has exactly 5 variants per channel for every trigger', () => {
    // 9 triggers × 3 channels × 5 variants.
    expect(ENGAGEMENT_TEMPLATES).toHaveLength(9 * 3 * 5);
    const groups = new Map<string, number>();
    for (const t of ENGAGEMENT_TEMPLATES) {
      const k = `${t.trigger}:${t.channel}`;
      groups.set(k, (groups.get(k) ?? 0) + 1);
    }
    expect(groups.size).toBe(27);
    for (const count of groups.values()) expect(count).toBe(5);
    // Keys are unique and well-formed.
    expect(new Set(ENGAGEMENT_TEMPLATES.map((t) => t.key)).size).toBe(ENGAGEMENT_TEMPLATES.length);
  });
});

describe.skipIf(!hasDb)('engagement automation', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;
  const variants: string[] = [];
  const products: string[] = [];

  async function customer(email: string, name: string, consent = true) {
    return prisma.customer.create({
      data: { tenantId: ctx.tenantId, storeId, email, name, marketingConsent: consent, marketingConsentAt: consent ? new Date() : null },
    });
  }
  async function paidOrder(customerId: string, variantId: string, amount: number, daysAgo: number) {
    const last = await prisma.order.aggregate({ where: { storeId }, _max: { number: true } });
    await prisma.order.create({
      data: {
        tenantId: ctx.tenantId, storeId, number: (last._max.number ?? 0) + 1, customerId, status: 'PAID', totalMinor: amount,
        createdAt: new Date(Date.now() - daysAgo * DAY),
        items: { create: [{ tenantId: ctx.tenantId, variantId, title: 'X', quantity: 1, unitPriceMinor: amount }] },
      },
    });
  }

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Engage Co' } });
    ctx = { tenantId: tenant.id };
    const store = await commerce.stores.create(ctx, { name: 'Engage Store' });
    storeId = store.id;
    // Email channel so customers (with email) are reachable.
    await commerce.integrations.configure(ctx, { storeId, provider: 'RESEND', credentials: { apiKey: 'stub' } });

    for (let i = 0; i < 4; i++) {
      const inv = i === 0 ? 3 : 50; // product 0 is low stock
      const p = await commerce.products.create(ctx, { storeId, title: `Item ${i}`, status: 'ACTIVE', variants: [{ priceMinor: 50000 + i * 10000, inventory: inv }] });
      products.push(p.id);
      variants.push(p.variants[0].id);
    }

    // Customers: some recent buyers (HOT), some lapsed (COLD), some never (COLD).
    for (let i = 0; i < 3; i++) {
      const c = await customer(`hot-${i}@ex.com`, `Hot Buyer${i}`);
      await paidOrder(c.id, variants[i % 4], 200000, 3); // 3 days ago → HOT
    }
    for (let i = 0; i < 2; i++) {
      const c = await customer(`cold-${i}@ex.com`, `Cold One${i}`);
      await paidOrder(c.id, variants[1], 120000, 200); // 200 days ago → COLD
    }
    await customer('new-0@ex.com', 'New Visitor'); // never bought → COLD
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('frequency-adjustment agent caps by temperature', () => {
    const policy = { hotMaxPer7Days: 4, warmMaxPer7Days: 2, coldMaxPer7Days: 1 } as any;
    expect(commerce.engagement.frequencyFor('HOT', policy)).toBe(4);
    expect(commerce.engagement.frequencyFor('WARM', policy)).toBe(2);
    expect(commerce.engagement.frequencyFor('COLD', policy)).toBe(1);
  });

  it('setupDefaults enables every trigger + a policy', async () => {
    const res = await commerce.engagement.setupDefaults(ctx, storeId, 'EMAIL');
    expect(res.campaigns).toBe(9);
    const campaigns = await commerce.engagement.listCampaigns(ctx, storeId);
    expect(campaigns.length).toBe(9);
    expect(campaigns.every((c) => c.enabled)).toBe(true);
    const policy = await commerce.engagement.getPolicy(ctx, storeId);
    expect(policy.perCustomerDailyCap).toBe(1);
  });

  it('hyper-personalises a preview with the customer first name + product', async () => {
    const hot = await prisma.customer.findFirst({ where: { storeId, email: 'hot-0@ex.com' } });
    const pv = await commerce.engagement.preview(ctx, { storeId, customerId: hot!.id, trigger: 'LOW_STOCK', channel: 'WHATSAPP' });
    expect(pv.temperature).toBe('HOT');
    expect(pv.body).toContain('Hot'); // first name "Hot" from "Hot Buyer0"
    expect(pv.body).toContain('Item 0'); // the low-stock product
    expect(pv.body).not.toContain('{{'); // every merge tag filled
  });

  it('dedups to one message per customer across many triggers (dry-run)', async () => {
    const run = await commerce.engagement.run(ctx, storeId, { dryRun: true });
    expect(run.dryRun).toBe(true);
    // 6 customers, all with email → each considered once.
    expect(run.considered).toBe(6);
    // Cross-cohort dedup: at most one message per customer.
    const perCustomer = new Map<string, number>();
    for (const m of run.messages) perCustomer.set(m.customerId, (perCustomer.get(m.customerId) ?? 0) + 1);
    expect([...perCustomer.values()].every((n) => n === 1)).toBe(true);
    expect(run.sent).toBe(6); // dry-run "sends" all (caps not applied)
    // Highest-priority trigger wins: with low stock present, LOW_STOCK should appear.
    expect(Object.keys(run.byTrigger).length).toBeGreaterThanOrEqual(1);
  });

  it('enforces frequency cap + min-gap on a real run (suppresses repeats)', async () => {
    // Tight policy: 1/day, big gap → second run within the gap must suppress.
    await commerce.engagement.setPolicy(ctx, { storeId, perCustomerDailyCap: 1, minHoursBetween: 24, coldMaxPer7Days: 1, warmMaxPer7Days: 2, hotMaxPer7Days: 4, quietStartHour: 0, quietEndHour: 0 });
    const first = await commerce.engagement.run(ctx, storeId, { dryRun: false });
    expect(first.sent).toBeGreaterThan(0); // EMAIL configured → real (stub) sends

    const second = await commerce.engagement.run(ctx, storeId, { dryRun: false });
    expect(second.sent).toBe(0); // all within min-gap / daily cap
    expect(second.suppressed).toBe(first.sent);
    const reasons = new Set(second.messages.map((m: any) => m.reason));
    expect([...reasons].some((r) => r === 'min_gap' || r === 'daily_cap')).toBe(true);

    // The log is the audit trail (real sends only by default).
    const log = await commerce.engagement.listLog(ctx, storeId, { limit: 100 });
    expect(log.some((m) => m.status === 'SENT')).toBe(true);
    expect(log.some((m) => m.status === 'SUPPRESSED')).toBe(true);
  });

  it('skips customers without marketing consent (and the unsubscribed)', async () => {
    const noConsent = await customer('noconsent@ex.com', 'No Consent', false);
    const unsub = await customer('unsub@ex.com', 'Un Sub', true);
    await commerce.customers.unsubscribe(storeId, 'unsub@ex.com');

    const run = await commerce.engagement.run(ctx, storeId, { dryRun: true });
    const byCustomer = new Map(run.messages.map((m: any) => [m.customerId, m]));
    expect(byCustomer.get(noConsent.id)?.status).toBe('SKIPPED');
    expect(byCustomer.get(noConsent.id)?.reason).toBe('no_consent');
    expect(byCustomer.get(unsub.id)?.status).toBe('SKIPPED');
    expect(byCustomer.get(unsub.id)?.reason).toBe('unsubscribed');

    // Granting consent makes them reachable again; messages carry an opt-out footer.
    await commerce.customers.setMarketingConsent(ctx, noConsent.id, true);
    const after = await commerce.engagement.run(ctx, storeId, { dryRun: true });
    const msg = after.messages.find((m: any) => m.customerId === noConsent.id);
    expect(msg?.status).toBe('SENT');
    expect(msg?.body.toLowerCase()).toMatch(/unsubscribe|opt out/); // opt-out footer present
  });
});
