import type {
  EngagementTrigger,
  NotificationChannel,
  PrismaClient,
  Store,
} from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';
import {
  CHANNEL_PROVIDER,
  getEmailProvider,
  getMessagingProvider,
  getSmsProvider,
} from '../adapters/registry.js';
import { renderTemplate } from '../notifications/defaults.js';
import {
  ENGAGEMENT_TEMPLATES,
  ENGAGEMENT_TRIGGERS,
  templateByKey,
  templatesFor,
  type EngTemplate,
  type Tone,
} from '../engagement/templates.js';
import type { IntegrationService } from './integration.service.js';
import type { CohortService, Temperature } from './cohort.service.js';

const PAID = ['PAID', 'FULFILLED'] as const;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const LOW_STOCK_AT = 5; // a variant with 1..5 units left is "low"

// Cross-trigger priority: when a customer matches several campaigns at once, the
// dedup keeps only the single most timely/important message.
const TRIGGER_PRIORITY: Record<EngagementTrigger, number> = {
  ABANDONED_CART: 100,
  BACK_IN_STOCK: 90,
  LOW_STOCK: 80,
  COHORT_OFFER: 70,
  NEW_IN_STOCK: 60,
  BEST_SELLING: 50,
  FESTIVE_DISCOUNT: 45,
  DISCOUNT: 40,
  SLOW_MOVING: 30,
};

// Which tones the personalisation agent prefers per temperature (HOT shoppers
// get premium/new/playful energy; COLD shoppers a gentle value/benefit nudge).
const TONE_BIAS: Record<Temperature, Tone[]> = {
  HOT: ['premium', 'playful', 'urgent'],
  WARM: ['friendly', 'value', 'premium'],
  COLD: ['value', 'friendly'],
};

interface DefaultPolicy {
  enabled: boolean;
  hotMaxPer7Days: number;
  warmMaxPer7Days: number;
  coldMaxPer7Days: number;
  perCustomerDailyCap: number;
  minHoursBetween: number;
  quietStartHour: number;
  quietEndHour: number;
}
const POLICY_DEFAULTS: DefaultPolicy = {
  enabled: true,
  hotMaxPer7Days: 4,
  warmMaxPer7Days: 2,
  coldMaxPer7Days: 1,
  perCustomerDailyCap: 1,
  minHoursBetween: 20,
  quietStartHour: 21,
  quietEndHour: 8,
};

interface CustomerRow {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  temperature: Temperature;
}

// A featured product for a broadcast trigger (same hero for everyone in the run).
interface Hero {
  productId: string;
  title: string;
  price: string;
  stockLeft?: number;
}

// One matched (customer, campaign) pairing before dedup.
interface Candidate {
  campaign: CampaignRow;
  productIds: string[];
  data: Record<string, unknown>; // trigger-specific merge data (product/cart/etc.)
}

interface CampaignRow {
  id: string;
  trigger: EngagementTrigger;
  channel: NotificationChannel;
  templateKey: string | null;
  temperatures: string[];
  cohortKey: string | null;
  priority: number;
}

export interface RunOptions {
  dryRun?: boolean;
  triggers?: EngagementTrigger[];
  respectQuietHours?: boolean;
  /** Cap how many customers to process (safety for very large stores). */
  limit?: number;
  now?: Date;
}

/**
 * Engagement automation. Turns nine merchandising/lifecycle triggers into
 * channel messages using a 5-variant template library, with three cooperating
 * agents:
 *   1. **Hyper-personalisation** — picks the best template variant per customer
 *      (biased by temperature) and fills it with their name, cohort and
 *      cohort-based product recommendations.
 *   2. **Frequency adjustment** — caps promo touches per rolling 7 days by
 *      HOT/WARM/COLD temperature (engaged shoppers tolerate more).
 *   3. **Cross-cohort dedup / fatigue guard** — a customer matching several
 *      campaigns gets only their single highest-priority message per run, and a
 *      per-day cap + minimum gap stop over-messaging across runs.
 */
export class EngagementService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly integrations: IntegrationService,
    private readonly cohorts: CohortService,
  ) {}

  // --- Templates ------------------------------------------------------------

  listTemplates(filter?: { trigger?: EngagementTrigger; channel?: NotificationChannel }): EngTemplate[] {
    return ENGAGEMENT_TEMPLATES.filter(
      (t) =>
        (!filter?.trigger || t.trigger === filter.trigger) &&
        (!filter?.channel || t.channel === filter.channel),
    );
  }

  /** Template library grouped by trigger → channel (for the gallery UI). */
  templateLibrary() {
    return ENGAGEMENT_TRIGGERS.map((trigger) => ({
      trigger,
      channels: (['EMAIL', 'SMS', 'WHATSAPP'] as NotificationChannel[]).map((channel) => ({
        channel,
        templates: templatesFor(trigger, channel),
      })),
    }));
  }

  // --- Campaigns ------------------------------------------------------------

  private async getStore(ctx: TenantContext, storeId: string): Promise<Store> {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, tenantId: ctx.tenantId } });
    if (!store) throw new NotFoundError('Store', storeId);
    return store;
  }

  async listCampaigns(ctx: TenantContext, storeId: string) {
    await this.getStore(ctx, storeId);
    return this.prisma.engagementCampaign.findMany({
      where: { tenantId: ctx.tenantId, storeId },
      orderBy: [{ trigger: 'asc' }, { channel: 'asc' }],
    });
  }

  async setCampaign(
    ctx: TenantContext,
    input: {
      storeId: string;
      trigger: EngagementTrigger;
      channel: NotificationChannel;
      enabled?: boolean;
      templateKey?: string | null;
      temperatures?: string[];
      cohortKey?: string | null;
      priority?: number;
    },
  ) {
    await this.getStore(ctx, input.storeId);
    if (input.templateKey) {
      const t = templateByKey(input.templateKey);
      if (!t || t.trigger !== input.trigger || t.channel !== input.channel) {
        throw new ValidationError(`templateKey ${input.templateKey} does not match trigger/channel`);
      }
    }
    return this.prisma.engagementCampaign.upsert({
      where: { storeId_trigger_channel: { storeId: input.storeId, trigger: input.trigger, channel: input.channel } },
      create: {
        tenantId: ctx.tenantId,
        storeId: input.storeId,
        trigger: input.trigger,
        channel: input.channel,
        enabled: input.enabled ?? true,
        templateKey: input.templateKey ?? null,
        temperatures: input.temperatures ?? [],
        cohortKey: input.cohortKey ?? null,
        priority: input.priority ?? TRIGGER_PRIORITY[input.trigger],
      },
      update: {
        enabled: input.enabled,
        templateKey: input.templateKey ?? undefined,
        temperatures: input.temperatures ?? undefined,
        cohortKey: input.cohortKey ?? undefined,
        priority: input.priority ?? undefined,
      },
    });
  }

  /** Provision a sensible default set: every trigger enabled on one channel. */
  async setupDefaults(ctx: TenantContext, storeId: string, channel: NotificationChannel = 'WHATSAPP') {
    await this.getStore(ctx, storeId);
    const created: string[] = [];
    for (const trigger of ENGAGEMENT_TRIGGERS) {
      await this.prisma.engagementCampaign.upsert({
        where: { storeId_trigger_channel: { storeId, trigger, channel } },
        create: {
          tenantId: ctx.tenantId,
          storeId,
          trigger,
          channel,
          enabled: true,
          priority: TRIGGER_PRIORITY[trigger],
        },
        update: {},
      });
      created.push(`${trigger}:${channel}`);
    }
    // Ensure a policy row exists so the automated daily run picks the store up.
    await this.prisma.engagementPolicy.upsert({
      where: { storeId },
      create: { tenantId: ctx.tenantId, storeId, ...POLICY_DEFAULTS },
      update: {},
    });
    return { campaigns: created.length, channel };
  }

  // --- Policy (frequency-adjustment agent config) ---------------------------

  async getPolicy(ctx: TenantContext, storeId: string) {
    await this.getStore(ctx, storeId);
    const row = await this.prisma.engagementPolicy.findUnique({ where: { storeId } });
    return row ?? { storeId, ...POLICY_DEFAULTS, isDefault: true };
  }

  async setPolicy(
    ctx: TenantContext,
    input: { storeId: string } & Partial<DefaultPolicy>,
  ) {
    await this.getStore(ctx, input.storeId);
    const { storeId, ...rest } = input;
    return this.prisma.engagementPolicy.upsert({
      where: { storeId },
      create: { tenantId: ctx.tenantId, storeId, ...POLICY_DEFAULTS, ...rest },
      update: rest,
    });
  }

  // --- Frequency-adjustment agent -------------------------------------------

  /** Max promotional sends per rolling 7 days for a temperature. */
  frequencyFor(temperature: Temperature, policy: DefaultPolicy): number {
    if (temperature === 'HOT') return policy.hotMaxPer7Days;
    if (temperature === 'WARM') return policy.warmMaxPer7Days;
    return policy.coldMaxPer7Days;
  }

  private async withinCaps(
    storeId: string,
    customerId: string,
    temperature: Temperature,
    policy: DefaultPolicy,
    now: Date,
  ): Promise<{ ok: boolean; reason?: string }> {
    const base = { storeId, customerId, status: 'SENT' as const, dryRun: false };
    const last = await this.prisma.engagementMessage.findFirst({
      where: { ...base, createdAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } },
      orderBy: { createdAt: 'desc' },
    });
    if (last && now.getTime() - last.createdAt.getTime() < policy.minHoursBetween * HOUR_MS) {
      return { ok: false, reason: 'min_gap' };
    }
    const weekCount = await this.prisma.engagementMessage.count({
      where: { ...base, createdAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } },
    });
    if (weekCount >= this.frequencyFor(temperature, policy)) return { ok: false, reason: `weekly_cap_${temperature.toLowerCase()}` };
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayCount = await this.prisma.engagementMessage.count({ where: { ...base, createdAt: { gte: dayStart } } });
    if (dayCount >= policy.perCustomerDailyCap) return { ok: false, reason: 'daily_cap' };
    return { ok: true };
  }

  // --- Hyper-personalisation agent ------------------------------------------

  private hash(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }

  /** Pick the best of the 5 variants for a customer (temperature-biased rotation). */
  private pickTemplate(
    campaign: CampaignRow,
    customerId: string,
    temperature: Temperature,
  ): EngTemplate {
    if (campaign.templateKey) {
      const pinned = templateByKey(campaign.templateKey);
      if (pinned) return pinned;
    }
    const all = templatesFor(campaign.trigger, campaign.channel);
    const biased = TONE_BIAS[temperature];
    const preferred = all.filter((t) => biased.includes(t.tone));
    const pool = preferred.length ? preferred : all;
    return pool[this.hash(customerId + campaign.trigger) % pool.length];
  }

  /** Render the chosen template with hyper-personalised data. */
  private async personalize(
    ctx: TenantContext,
    store: Store,
    campaign: CampaignRow,
    customer: CustomerRow,
    candidate: Candidate,
  ): Promise<{ template: EngTemplate; subject?: string; body: string; productIds: string[] }> {
    const template = this.pickTemplate(campaign, customer.id, customer.temperature);
    const base = this.storeBase(store);
    const data: Record<string, unknown> = {
      storeName: store.name,
      firstName: firstName(customer.name),
      url: base,
      cartUrl: `${base}/cart`,
      discount: '15%',
      code: 'SAVE15',
      festival: candidate.data.festival ?? festivalFor(new Date()),
      ...candidate.data,
    };

    // Fill cohort-based recommendations when the template asks for them, or for
    // cohort/offer triggers where the product itself is the recommendation.
    const productIds = [...candidate.productIds];
    if (template.body.includes('{{recommended}}') || (campaign.trigger === 'COHORT_OFFER' && !data.product)) {
      const recs = await this.cohorts.recommendations(ctx, customer.id, 2).catch(() => ({ recommendations: [] as any[] }));
      const names = recs.recommendations.map((r: any) => r.title).filter(Boolean);
      if (names.length) {
        data.recommended = names.join(' & ');
        if (!data.product) data.product = names[0];
        for (const r of recs.recommendations) if (r.productId) productIds.push(r.productId);
      }
    }
    // Sensible fallbacks so a template never renders an empty hole.
    if (!data.recommended) data.recommended = (data.product as string) ?? 'something you’ll love';
    if (!data.product) data.product = (data.recommended as string) ?? 'our latest';
    if (!data.price) data.price = '';
    if (!data.stockLeft && template.body.includes('{{stockLeft}}')) data.stockLeft = 'a few';

    const subject = template.subject ? renderTemplate(template.subject, data) : undefined;
    const body = renderTemplate(template.body, data);
    return { template, subject, body, productIds: Array.from(new Set(productIds)) };
  }

  // --- Audience building (per trigger) --------------------------------------

  private storeBase(store: Store): string {
    return store.domain ? `https://${store.domain}` : `https://${store.slug}.acp.store`;
  }

  /** Newest active, in-stock product. */
  private async heroNewest(storeId: string): Promise<Hero | null> {
    const p = await this.prisma.product.findFirst({
      where: { storeId, status: 'ACTIVE', variants: { some: { inventory: { gt: 0 } } } },
      orderBy: { createdAt: 'desc' },
      include: { variants: { orderBy: { priceMinor: 'asc' }, take: 1 } },
    });
    return p ? { productId: p.id, title: p.title, price: money(p.variants[0]?.priceMinor, p.variants[0]?.currency) } : null;
  }

  /** Top product by paid-order quantity. */
  private async heroBestSelling(storeId: string): Promise<Hero | null> {
    const grouped = await this.prisma.orderItem.groupBy({
      by: ['variantId'],
      where: { order: { storeId, status: { in: [...PAID] } } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 10,
    });
    for (const g of grouped) {
      if (!g.variantId) continue;
      const v = await this.prisma.productVariant.findUnique({ where: { id: g.variantId }, include: { product: true } });
      if (v?.product) return { productId: v.productId, title: v.product.title, price: money(v.priceMinor, v.currency) };
    }
    return null;
  }

  /** Oldest active in-stock product with no recent sales. */
  private async heroSlowMoving(storeId: string, now: Date): Promise<Hero | null> {
    const recent = await this.prisma.orderItem.findMany({
      where: { order: { storeId, status: { in: [...PAID] }, createdAt: { gte: new Date(now.getTime() - 60 * DAY_MS) } } },
      select: { variant: { select: { productId: true } } },
    });
    const soldProducts = new Set(recent.map((r) => r.variant?.productId).filter(Boolean) as string[]);
    const candidates = await this.prisma.product.findMany({
      where: { storeId, status: 'ACTIVE', variants: { some: { inventory: { gt: 0 } } }, createdAt: { lte: new Date(now.getTime() - 30 * DAY_MS) } },
      orderBy: { createdAt: 'asc' },
      include: { variants: { orderBy: { priceMinor: 'asc' }, take: 1 } },
      take: 20,
    });
    const stale = candidates.find((p) => !soldProducts.has(p.id)) ?? candidates[0];
    return stale ? { productId: stale.id, title: stale.title, price: money(stale.variants[0]?.priceMinor, stale.variants[0]?.currency) } : null;
  }

  /** Product whose lowest variant inventory is in 1..LOW_STOCK_AT. */
  private async heroLowStock(storeId: string): Promise<Hero | null> {
    const v = await this.prisma.productVariant.findFirst({
      where: { product: { storeId, status: 'ACTIVE' }, inventory: { gt: 0, lte: LOW_STOCK_AT } },
      orderBy: { inventory: 'asc' },
      include: { product: true },
    });
    return v?.product
      ? { productId: v.productId, title: v.product.title, price: money(v.priceMinor, v.currency), stockLeft: v.inventory }
      : null;
  }

  /** Customers who added a product to cart that is currently in stock again. */
  private async backInStockByCustomer(storeId: string): Promise<Map<string, Hero>> {
    const events = await this.prisma.behaviorEvent.findMany({
      where: { storeId, type: 'ADD_TO_CART', customerId: { not: null }, productId: { not: null } },
      select: { customerId: true, productId: true },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });
    const out = new Map<string, Hero>();
    const productCache = new Map<string, Hero | null>();
    for (const e of events) {
      if (!e.customerId || !e.productId || out.has(e.customerId)) continue;
      let hero = productCache.get(e.productId);
      if (hero === undefined) {
        const p = await this.prisma.product.findFirst({
          where: { id: e.productId, storeId, status: 'ACTIVE', variants: { some: { inventory: { gt: 0 } } } },
          include: { variants: { orderBy: { priceMinor: 'asc' }, take: 1 } },
        });
        hero = p ? { productId: p.id, title: p.title, price: money(p.variants[0]?.priceMinor, p.variants[0]?.currency) } : null;
        productCache.set(e.productId, hero);
      }
      if (hero) out.set(e.customerId, hero);
    }
    return out;
  }

  /** Customers with an abandoned cart → their cart's lead item. */
  private async abandonedCartByCustomer(storeId: string): Promise<Map<string, Hero>> {
    const carts = await this.prisma.cart.findMany({
      where: { storeId, status: 'ABANDONED', customerId: { not: null } },
      include: { items: { take: 1 } },
      orderBy: { lastActivityAt: 'desc' },
    });
    const out = new Map<string, Hero>();
    for (const c of carts) {
      if (!c.customerId || out.has(c.customerId) || !c.items.length) continue;
      out.set(c.customerId, { productId: c.items[0].variantId, title: c.items[0].title, price: money(c.items[0].unitPriceMinor) });
    }
    return out;
  }

  /** Distinct customers who belong to at least one cohort (optionally one cohort). */
  private async cohortMembers(ctx: TenantContext, storeId: string, cohortKey: string | null): Promise<Set<string>> {
    const cohorts = await this.prisma.cohort.findMany({
      where: { tenantId: ctx.tenantId, storeId, ...(cohortKey ? { key: cohortKey } : {}) },
      select: { id: true },
    });
    if (!cohorts.length) return new Set();
    const members = await this.prisma.cohortMembership.findMany({
      where: { cohortId: { in: cohorts.map((c) => c.id) } },
      select: { customerId: true },
    });
    return new Set(members.map((m) => m.customerId));
  }

  // --- Orchestrator ---------------------------------------------------------

  async run(ctx: TenantContext, storeId: string, opts: RunOptions = {}) {
    const store = await this.getStore(ctx, storeId);
    const now = opts.now ?? new Date();
    const dryRun = opts.dryRun ?? false;
    const policy = await this.effectivePolicy(storeId);

    let campaigns: CampaignRow[] = (await this.prisma.engagementCampaign.findMany({
      where: { tenantId: ctx.tenantId, storeId, enabled: true },
    })).map((c) => ({
      id: c.id, trigger: c.trigger, channel: c.channel, templateKey: c.templateKey,
      temperatures: c.temperatures, cohortKey: c.cohortKey, priority: c.priority,
    }));
    if (opts.triggers?.length) campaigns = campaigns.filter((c) => opts.triggers!.includes(c.trigger));
    if (!campaigns.length) {
      return { storeId, dryRun, considered: 0, sent: 0, suppressed: 0, skipped: 0, byTrigger: {}, messages: [], note: 'no_enabled_campaigns' };
    }

    // Build the customer roster with temperature.
    const customers = await this.loadCustomers(storeId, now);
    const byId = new Map(customers.map((c) => [c.id, c]));

    // Precompute audiences shared across customers.
    const triggers = new Set(campaigns.map((c) => c.trigger));
    const heroes: Partial<Record<EngagementTrigger, Hero | null>> = {};
    if (triggers.has('NEW_IN_STOCK')) heroes.NEW_IN_STOCK = await this.heroNewest(storeId);
    if (triggers.has('BEST_SELLING')) heroes.BEST_SELLING = await this.heroBestSelling(storeId);
    if (triggers.has('SLOW_MOVING')) heroes.SLOW_MOVING = await this.heroSlowMoving(storeId, now);
    if (triggers.has('LOW_STOCK')) heroes.LOW_STOCK = await this.heroLowStock(storeId);
    const backInStock = triggers.has('BACK_IN_STOCK') ? await this.backInStockByCustomer(storeId) : new Map<string, Hero>();
    const abandoned = triggers.has('ABANDONED_CART') ? await this.abandonedCartByCustomer(storeId) : new Map<string, Hero>();

    // Pair customers to campaigns they qualify for.
    const candidates = new Map<string, Candidate[]>();
    const add = (customerId: string, c: Candidate) => {
      const list = candidates.get(customerId) ?? [];
      list.push(c);
      candidates.set(customerId, list);
    };

    for (const campaign of campaigns) {
      const tempFilter = new Set(campaign.temperatures);
      const accepts = (cust: CustomerRow) => tempFilter.size === 0 || tempFilter.has(cust.temperature);

      if (campaign.trigger === 'BACK_IN_STOCK') {
        for (const [customerId, hero] of backInStock) {
          const cust = byId.get(customerId);
          if (cust && accepts(cust)) add(customerId, { campaign, productIds: [hero.productId], data: heroData(hero) });
        }
      } else if (campaign.trigger === 'ABANDONED_CART') {
        for (const [customerId, hero] of abandoned) {
          const cust = byId.get(customerId);
          if (cust && accepts(cust)) add(customerId, { campaign, productIds: [hero.productId], data: heroData(hero) });
        }
      } else if (campaign.trigger === 'COHORT_OFFER') {
        const members = await this.cohortMembers(ctx, storeId, campaign.cohortKey);
        for (const customerId of members) {
          const cust = byId.get(customerId);
          if (cust && accepts(cust)) add(customerId, { campaign, productIds: [], data: {} });
        }
      } else {
        // Broadcast: same hero to all qualifying customers.
        const hero = heroes[campaign.trigger];
        if (campaign.trigger !== 'DISCOUNT' && campaign.trigger !== 'FESTIVE_DISCOUNT' && !hero) continue;
        const data = hero ? heroData(hero) : {};
        for (const cust of customers) {
          if (accepts(cust)) add(cust.id, { campaign, productIds: hero ? [hero.productId] : [], data: { ...data } });
        }
      }
    }

    // Cross-cohort dedup: one winning message per customer.
    const ordered = [...candidates.entries()];
    const summary = { sent: 0, suppressed: 0, skipped: 0 };
    const byTrigger: Record<string, number> = {};
    const messages: any[] = [];
    let processed = 0;

    for (const [customerId, cands] of ordered) {
      if (opts.limit && processed >= opts.limit) break;
      const cust = byId.get(customerId);
      if (!cust) continue;
      processed++;

      const winner = cands.sort(
        (a, b) => (b.campaign.priority - a.campaign.priority) || (TRIGGER_PRIORITY[b.campaign.trigger] - TRIGGER_PRIORITY[a.campaign.trigger]),
      )[0];
      const channel = winner.campaign.channel;
      const to = channel === 'EMAIL' ? cust.email : cust.phone;

      const rendered = await this.personalize(ctx, store, winner.campaign, cust, winner);
      const record = (status: 'SENT' | 'SUPPRESSED' | 'SKIPPED' | 'FAILED', reason?: string, providerRef?: string) =>
        this.log({ ctx, storeId, customerId, trigger: winner.campaign.trigger, channel, templateKey: rendered.template.key, temperature: cust.temperature, to: to ?? '', body: rendered.body, status, reason, providerRef, productIds: rendered.productIds, dryRun });

      let entry;
      const cap = !to || dryRun ? { ok: true } : await this.withinCaps(storeId, customerId, cust.temperature, policy, now);
      if (!to) {
        entry = await record('SKIPPED', `no_${channel === 'EMAIL' ? 'email' : 'phone'}`);
        summary.skipped++;
      } else if (opts.respectQuietHours && inQuietWindow(now, policy)) {
        entry = await record('SUPPRESSED', 'quiet_hours');
        summary.suppressed++;
      } else if (!cap.ok) {
        entry = await record('SUPPRESSED', cap.reason);
        summary.suppressed++;
      } else {
        const sent = dryRun
          ? { status: 'SENT' as const, providerRef: undefined, reason: 'dry_run' }
          : await this.deliver(ctx, store, channel, to, rendered.subject, rendered.body);
        entry = await record(sent.status, sent.reason, sent.providerRef);
        if (sent.status === 'SENT') {
          summary.sent++;
          byTrigger[winner.campaign.trigger] = (byTrigger[winner.campaign.trigger] ?? 0) + 1;
        } else summary.skipped++;
      }
      messages.push(entry);
    }

    return { storeId, dryRun, considered: ordered.length, ...summary, byTrigger, messages };
  }

  /** Render a single hyper-personalised message for a customer (no send). */
  async preview(
    ctx: TenantContext,
    input: { storeId: string; customerId: string; trigger: EngagementTrigger; channel: NotificationChannel; templateKey?: string },
  ) {
    const store = await this.getStore(ctx, input.storeId);
    const customer = await this.prisma.customer.findFirst({ where: { id: input.customerId, tenantId: ctx.tenantId, storeId: input.storeId } });
    if (!customer) throw new NotFoundError('Customer', input.customerId);
    const last = await this.prisma.order.aggregate({ where: { customerId: customer.id, status: { in: [...PAID] } }, _max: { createdAt: true } });
    const temperature = this.cohorts.temperatureFor(last._max.createdAt ?? null);
    const cust: CustomerRow = { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone, temperature };
    const campaign: CampaignRow = { id: 'preview', trigger: input.trigger, channel: input.channel, templateKey: input.templateKey ?? null, temperatures: [], cohortKey: null, priority: TRIGGER_PRIORITY[input.trigger] };

    // Supply a representative hero so non-cohort triggers preview with a product.
    const hero = await this.previewHero(ctx, input.storeId, input.trigger, customer.id);
    const rendered = await this.personalize(ctx, store, campaign, cust, { campaign, productIds: hero ? [hero.productId] : [], data: hero ? heroData(hero) : {} });
    return {
      trigger: input.trigger,
      channel: input.channel,
      temperature,
      to: input.channel === 'EMAIL' ? customer.email : customer.phone,
      templateKey: rendered.template.key,
      templateName: rendered.template.name,
      tone: rendered.template.tone,
      subject: rendered.subject,
      body: rendered.body,
    };
  }

  private async previewHero(ctx: TenantContext, storeId: string, trigger: EngagementTrigger, customerId: string): Promise<Hero | null> {
    const now = new Date();
    // For preview we always want a real product to render, so product-centric
    // triggers fall back to the newest in-stock item when their specific source
    // is empty (a live run only fires the trigger when its real hero exists).
    switch (trigger) {
      case 'NEW_IN_STOCK': return this.heroNewest(storeId);
      case 'BEST_SELLING': return (await this.heroBestSelling(storeId)) ?? this.heroNewest(storeId);
      case 'SLOW_MOVING': return (await this.heroSlowMoving(storeId, now)) ?? this.heroNewest(storeId);
      case 'LOW_STOCK': return (await this.heroLowStock(storeId)) ?? this.heroNewest(storeId);
      case 'BACK_IN_STOCK': return (await this.backInStockByCustomer(storeId)).get(customerId) ?? this.heroNewest(storeId);
      case 'ABANDONED_CART': return (await this.abandonedCartByCustomer(storeId)).get(customerId) ?? this.heroNewest(storeId);
      default: return null; // DISCOUNT / FESTIVE_DISCOUNT / COHORT_OFFER fill from recs
    }
  }

  async listLog(ctx: TenantContext, storeId: string, opts?: { limit?: number; includeDryRun?: boolean }) {
    await this.getStore(ctx, storeId);
    return this.prisma.engagementMessage.findMany({
      where: { tenantId: ctx.tenantId, storeId, ...(opts?.includeDryRun ? {} : { dryRun: false }) },
      orderBy: { createdAt: 'desc' },
      take: opts?.limit ?? 100,
    });
  }

  /** Cross-tenant worker job: run engagement once a day per opted-in store. */
  async runDueEngagement(now: Date = new Date()): Promise<{ scanned: number; ran: number; sent: number }> {
    const policies = await this.prisma.engagementPolicy.findMany({ where: { enabled: true } });
    let ran = 0;
    let sent = 0;
    for (const p of policies) {
      if (p.lastRunAt && now.getTime() - p.lastRunAt.getTime() < DAY_MS) continue;
      const store = await this.prisma.store.findFirst({ where: { id: p.storeId, status: 'ACTIVE' }, select: { id: true } });
      if (!store) continue;
      const res = await this.run({ tenantId: p.tenantId }, p.storeId, { respectQuietHours: true, now }).catch(() => null);
      await this.prisma.engagementPolicy.update({ where: { storeId: p.storeId }, data: { lastRunAt: now } });
      if (res) { ran++; sent += res.sent; }
    }
    return { scanned: policies.length, ran, sent };
  }

  // --- Internals ------------------------------------------------------------

  private async effectivePolicy(storeId: string): Promise<DefaultPolicy & { lastRunAt?: Date | null }> {
    const row = await this.prisma.engagementPolicy.findUnique({ where: { storeId } });
    return row ?? { ...POLICY_DEFAULTS };
  }

  private async loadCustomers(storeId: string, now: Date): Promise<CustomerRow[]> {
    const customers = await this.prisma.customer.findMany({
      where: { storeId },
      select: { id: true, name: true, email: true, phone: true },
    });
    if (!customers.length) return [];
    const lastOrders = await this.prisma.order.groupBy({
      by: ['customerId'],
      where: { storeId, status: { in: [...PAID] }, customerId: { in: customers.map((c) => c.id) } },
      _max: { createdAt: true },
    });
    const lastMap = new Map(lastOrders.map((g) => [g.customerId!, g._max.createdAt ?? null]));
    return customers.map((c) => ({
      ...c,
      temperature: this.cohorts.temperatureFor(lastMap.get(c.id) ?? null, now.getTime()),
    }));
  }

  private async deliver(
    ctx: TenantContext,
    store: Store,
    channel: NotificationChannel,
    to: string,
    subject: string | undefined,
    body: string,
  ): Promise<{ status: 'SENT' | 'SKIPPED' | 'FAILED'; reason?: string; providerRef?: string }> {
    let creds;
    try {
      creds = await this.integrations.getCredentials(ctx, store.id, CHANNEL_PROVIDER[channel]);
    } catch {
      return { status: 'SKIPPED', reason: 'channel_not_configured' };
    }
    try {
      const provider = CHANNEL_PROVIDER[channel];
      let providerRef: string;
      if (channel === 'EMAIL') providerRef = (await getEmailProvider(provider, creds).send({ to, subject: subject ?? '', body })).messageId;
      else if (channel === 'SMS') providerRef = (await getSmsProvider(provider, creds).send({ to, body })).messageId;
      else providerRef = (await getMessagingProvider(provider, creds).sendMessage({ to, body })).messageId;
      return { status: 'SENT', providerRef };
    } catch (err) {
      return { status: 'FAILED', reason: (err as Error).message };
    }
  }

  private async log(args: {
    ctx: TenantContext;
    storeId: string;
    customerId: string;
    trigger: EngagementTrigger;
    channel: NotificationChannel;
    templateKey: string;
    temperature: Temperature;
    to: string;
    body: string;
    status: 'SENT' | 'SUPPRESSED' | 'SKIPPED' | 'FAILED';
    reason?: string;
    providerRef?: string;
    productIds: string[];
    dryRun: boolean;
  }) {
    return this.prisma.engagementMessage.create({
      data: {
        tenantId: args.ctx.tenantId,
        storeId: args.storeId,
        customerId: args.customerId,
        trigger: args.trigger,
        channel: args.channel,
        templateKey: args.templateKey,
        temperature: args.temperature,
        to: args.to,
        body: args.body,
        status: args.status,
        reason: args.reason,
        providerRef: args.providerRef,
        productIds: args.productIds,
        dryRun: args.dryRun,
      },
    });
  }
}

// --- Free helpers -----------------------------------------------------------

function firstName(name: string | null): string {
  if (!name) return 'there';
  return name.trim().split(/\s+/)[0] || 'there';
}

function money(minor?: number | null, currency = 'INR'): string {
  if (minor == null) return '';
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(0)}`;
  }
}

function heroData(hero: Hero): Record<string, unknown> {
  return { product: hero.title, price: hero.price, stockLeft: hero.stockLeft ?? '' };
}

// India-first festive theming by month (approximate; merchant can override copy).
function festivalFor(now: Date): string {
  const m = now.getMonth(); // 0=Jan
  if (m === 9 || m === 10) return 'Diwali';
  if (m === 2) return 'Holi';
  if (m === 7) return 'Independence Day';
  if (m === 0) return 'New Year';
  if (m === 5 || m === 6) return 'Monsoon Sale';
  return 'Festive Season';
}

function inQuietWindow(now: Date, policy: { quietStartHour: number; quietEndHour: number }): boolean {
  const h = now.getHours();
  const { quietStartHour: s, quietEndHour: e } = policy;
  return s > e ? h >= s || h < e : h >= s && h < e;
}
