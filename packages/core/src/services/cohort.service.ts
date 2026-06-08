import type { BehaviorEventType, PrismaClient } from '@prisma/client';
import { NotFoundError, type TenantContext } from '../context.js';

const PAID = ['PAID', 'FULFILLED'] as const;
const DAY_MS = 86_400_000;

// Hot/warm/cold by recency of last purchase.
const HOT_DAYS = 30;
const WARM_DAYS = 90;
export type Temperature = 'HOT' | 'WARM' | 'COLD';

// Behavioural clustering config.
const MIN_FOR_CLUSTERING = 6; // need enough customers to form micro-cohorts
const MEMBERSHIP_THRESHOLD = 0.18; // join a cohort when soft membership ≥ this
const ACQ_MIN_SIZE = 3; // min customers to form an acquisition cohort

export interface TrackEventInput {
  storeId: string;
  type: BehaviorEventType;
  anonymousId?: string;
  email?: string;
  productId?: string;
  variantId?: string;
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  query?: string;
  /** For SEARCH events: how many results the query returned (0 = unmet demand). */
  resultCount?: number;
}

interface Feat {
  customerId: string;
  source: string; // normalized channel
  campaign: string | null;
  term: string | null;
  views: number;
  clicks: number;
  carts: number;
  searches: number;
  searchTerms: string[]; // distinct on-site search queries (normalized)
  distinctViewed: number;
  orders: number;
  spendMinor: number;
  lastOrderAt: Date | null;
  vector: number[]; // engineered numeric features (pre-standardization)
}

/**
 * Cohort intelligence. Tracks the storefront funnel (with Meta/Google acquisition
 * attribution), then forms **micro-cohorts** two ways: soft clustering (fuzzy
 * c-means) over engineered behaviour+attribution features — so a customer can
 * belong to several cohorts with a weight — and explicit acquisition cohorts per
 * campaign / search term. It classifies customers HOT/WARM/COLD by purchase
 * recency and recommends "what others in your cohort bought".
 */
export class CohortService {
  constructor(private readonly prisma: PrismaClient) {}

  // --- Tracking -------------------------------------------------------------

  private channel(source?: string | null): string {
    const s = (source ?? '').toLowerCase();
    if (!s) return 'direct';
    if (s.includes('meta') || s.includes('facebook') || s.includes('instagram') || s.includes('fb')) return 'meta';
    if (s.includes('google')) return 'google';
    return s;
  }

  /** Record a behaviour event; identify + stitch sessions when an email is given. */
  async track(input: TrackEventInput) {
    const store = await this.prisma.store.findUnique({ where: { id: input.storeId }, select: { id: true, tenantId: true } });
    if (!store) throw new NotFoundError('Store', input.storeId);

    let customerId: string | undefined;
    if (input.email) {
      const existing = await this.prisma.customer.findFirst({
        where: { storeId: store.id, email: { equals: input.email, mode: 'insensitive' } },
        select: { id: true, acqSource: true },
      });
      if (existing) {
        customerId = existing.id;
        // First-touch attribution: only set if not already attributed.
        if (!existing.acqSource && input.source) {
          await this.prisma.customer.update({
            where: { id: existing.id },
            data: { acqSource: this.channel(input.source), acqCampaign: input.campaign ?? null, acqTerm: input.term ?? null },
          });
        }
      } else {
        const created = await this.prisma.customer.create({
          data: {
            tenantId: store.tenantId,
            storeId: store.id,
            email: input.email,
            acqSource: input.source ? this.channel(input.source) : undefined,
            acqCampaign: input.campaign,
            acqTerm: input.term,
          },
        });
        customerId = created.id;
      }
      // Stitch prior anonymous events from this session to the customer.
      if (input.anonymousId) {
        await this.prisma.behaviorEvent.updateMany({
          where: { storeId: store.id, anonymousId: input.anonymousId, customerId: null },
          data: { customerId },
        });
      }
      // First-touch attribution: if the customer isn't attributed yet, derive it
      // from the current event's source, else the earliest attributed event
      // (e.g. a LAND captured before the shopper identified themselves).
      const cur = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { acqSource: true } });
      if (!cur?.acqSource) {
        const firstTouch = input.source
          ? { source: this.channel(input.source), campaign: input.campaign ?? null, term: input.term ?? null }
          : await this.prisma.behaviorEvent.findFirst({
              where: {
                storeId: store.id,
                source: { not: null },
                OR: [{ customerId }, ...(input.anonymousId ? [{ anonymousId: input.anonymousId }] : [])],
              },
              orderBy: { createdAt: 'asc' },
              select: { source: true, campaign: true, term: true },
            });
        if (firstTouch?.source) {
          await this.prisma.customer.update({
            where: { id: customerId },
            data: { acqSource: firstTouch.source, acqCampaign: firstTouch.campaign, acqTerm: firstTouch.term },
          });
        }
      }
    }

    await this.prisma.behaviorEvent.create({
      data: {
        tenantId: store.tenantId,
        storeId: store.id,
        customerId,
        anonymousId: input.anonymousId,
        type: input.type,
        productId: input.productId,
        variantId: input.variantId,
        source: input.source ? this.channel(input.source) : undefined,
        medium: input.medium,
        campaign: input.campaign,
        term: input.term,
        query: input.query ? input.query.trim().slice(0, 120) : undefined,
        resultCount: typeof input.resultCount === 'number' ? Math.max(0, Math.trunc(input.resultCount)) : undefined,
      },
    });
    return { tracked: true, customerId: customerId ?? null };
  }

  // --- Temperature ----------------------------------------------------------

  temperatureFor(lastOrderAt: Date | null, now = Date.now()): Temperature {
    if (!lastOrderAt) return 'COLD';
    const days = (now - lastOrderAt.getTime()) / DAY_MS;
    if (days <= HOT_DAYS) return 'HOT';
    if (days <= WARM_DAYS) return 'WARM';
    return 'COLD';
  }

  // --- Feature engineering --------------------------------------------------

  private async features(storeId: string): Promise<Feat[]> {
    const customers = await this.prisma.customer.findMany({
      where: { storeId },
      select: { id: true, acqSource: true, acqCampaign: true, acqTerm: true },
    });
    if (!customers.length) return [];
    const ids = customers.map((c) => c.id);

    // Behaviour events grouped per customer.
    const events = await this.prisma.behaviorEvent.findMany({
      where: { storeId, customerId: { in: ids } },
      select: { customerId: true, type: true, productId: true, source: true, query: true },
    });
    type Agg = { views: number; clicks: number; carts: number; searches: number; products: Set<string>; queries: Set<string>; source?: string };
    const ev = new Map<string, Agg>();
    for (const e of events) {
      if (!e.customerId) continue;
      const r = ev.get(e.customerId) ?? { views: 0, clicks: 0, carts: 0, searches: 0, products: new Set<string>(), queries: new Set<string>() };
      if (e.type === 'VIEW') r.views++;
      else if (e.type === 'CLICK') r.clicks++;
      else if (e.type === 'ADD_TO_CART') r.carts++;
      else if (e.type === 'SEARCH') {
        r.searches++;
        const q = this.normalizeQuery(e.query);
        if (q) r.queries.add(q);
      }
      if (e.productId) r.products.add(e.productId);
      if (!r.source && e.source) r.source = e.source;
      ev.set(e.customerId, r);
    }
    const emptyAgg: Agg = { views: 0, clicks: 0, carts: 0, searches: 0, products: new Set(), queries: new Set() };

    // Order stats per customer.
    const grouped = await this.prisma.order.groupBy({
      by: ['customerId'],
      where: { storeId, customerId: { in: ids }, status: { in: [...PAID] } },
      _sum: { totalMinor: true },
      _count: true,
      _max: { createdAt: true },
    });
    const ord = new Map(grouped.map((g) => [g.customerId!, { orders: g._count, spend: g._sum.totalMinor ?? 0, last: g._max.createdAt ?? null }]));

    return customers.map((c) => {
      const e = ev.get(c.id) ?? emptyAgg;
      const o = ord.get(c.id) ?? { orders: 0, spend: 0, last: null as Date | null };
      const source = this.channel(c.acqSource ?? e.source);
      const recencyDays = o.last ? (Date.now() - o.last.getTime()) / DAY_MS : 365;
      const vector = [
        Math.min(recencyDays, 365) / 365, // recency (0 fresh → 1 stale)
        o.orders,
        o.spend / 100000, // spend in ₹1,000 units-ish
        e.views,
        e.clicks,
        e.carts,
        e.searches, // on-site search intent
        e.products.size,
        source === 'meta' ? 1 : 0,
        source === 'google' ? 1 : 0,
        source === 'direct' ? 1 : 0,
      ];
      return {
        customerId: c.id,
        source,
        campaign: c.acqCampaign,
        term: c.acqTerm,
        views: e.views,
        clicks: e.clicks,
        carts: e.carts,
        searches: e.searches,
        searchTerms: [...e.queries],
        distinctViewed: e.products.size,
        orders: o.orders,
        spendMinor: o.spend,
        lastOrderAt: o.last,
        vector,
      };
    });
  }

  // --- Fuzzy c-means (soft clustering → multi-membership) -------------------

  private standardize(rows: number[][]): number[][] {
    const d = rows[0].length;
    const mean = new Array(d).fill(0);
    const std = new Array(d).fill(0);
    for (const r of rows) for (let j = 0; j < d; j++) mean[j] += r[j] / rows.length;
    for (const r of rows) for (let j = 0; j < d; j++) std[j] += (r[j] - mean[j]) ** 2 / rows.length;
    for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j]) || 1;
    return rows.map((r) => r.map((v, j) => (v - mean[j]) / std[j]));
  }

  // Deterministic RNG so cohorts are reproducible across recomputes.
  private rng(seed: number) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  private dist(a: number[], b: number[]) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
    return Math.sqrt(s);
  }

  /** Returns a soft membership matrix U (N×K). m = fuzziness. */
  private fuzzyCMeans(X: number[][], K: number, seed: number, m = 2, iters = 40): number[][] {
    const N = X.length;
    const D = X[0].length;
    const rand = this.rng(seed);
    // Init memberships, normalized per row.
    let U = Array.from({ length: N }, () => {
      const row = Array.from({ length: K }, () => rand() + 1e-3);
      const sum = row.reduce((a, b) => a + b, 0);
      return row.map((v) => v / sum);
    });
    let centroids = Array.from({ length: K }, () => new Array(D).fill(0));
    const exp = 2 / (m - 1);

    for (let it = 0; it < iters; it++) {
      // Update centroids.
      for (let k = 0; k < K; k++) {
        const c = new Array(D).fill(0);
        let denom = 0;
        for (let i = 0; i < N; i++) {
          const w = U[i][k] ** m;
          denom += w;
          for (let j = 0; j < D; j++) c[j] += w * X[i][j];
        }
        centroids[k] = c.map((v) => (denom ? v / denom : 0));
      }
      // Update memberships.
      const U2 = Array.from({ length: N }, () => new Array(K).fill(0));
      for (let i = 0; i < N; i++) {
        const d = centroids.map((c) => this.dist(X[i], c) || 1e-6);
        for (let k = 0; k < K; k++) {
          let sum = 0;
          for (let j = 0; j < K; j++) sum += (d[k] / d[j]) ** exp;
          U2[i][k] = 1 / sum;
        }
      }
      U = U2;
    }
    return U;
  }

  // --- Recompute (the ML job) -----------------------------------------------

  async recompute(ctx: TenantContext, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, tenantId: ctx.tenantId }, select: { id: true } });
    if (!store) throw new NotFoundError('Store', storeId);
    const feats = await this.features(storeId);

    // Reset existing cohorts for the store (memberships cascade).
    await this.prisma.cohort.deleteMany({ where: { tenantId: ctx.tenantId, storeId } });

    const cohorts: { key: string; kind: 'BEHAVIORAL' | 'ACQUISITION' | 'SEARCH_INTENT'; label: string; signature: any; members: { customerId: string; weight: number }[] }[] = [];

    // 1) Behavioural micro-cohorts via fuzzy c-means.
    if (feats.length >= MIN_FOR_CLUSTERING) {
      const K = Math.max(2, Math.min(6, Math.floor(feats.length / 6)));
      const X = this.standardize(feats.map((f) => f.vector));
      const seed = Array.from(storeId).reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
      const U = this.fuzzyCMeans(X, K, seed);

      for (let k = 0; k < K; k++) {
        const members = feats
          .map((f, i) => ({ f, w: U[i][k], top: U[i].indexOf(Math.max(...U[i])) === k }))
          .filter((x) => x.w >= MEMBERSHIP_THRESHOLD || x.top)
          .map((x) => ({ customerId: x.f.customerId, weight: Math.round(x.w * 1000) / 1000, f: x.f }));
        if (!members.length) continue;
        cohorts.push({
          key: `behavioral:${k}`,
          kind: 'BEHAVIORAL',
          label: this.labelBehavioral(members.map((m) => m.f)),
          signature: this.signature(members.map((m) => m.f)),
          members: members.map((m) => ({ customerId: m.customerId, weight: m.weight })),
        });
      }
    }

    // 2) Acquisition cohorts (Meta campaigns / Google search terms).
    const acq = new Map<string, { label: string; members: string[] }>();
    for (const f of feats) {
      if (f.campaign) {
        const key = `acq:${f.source}:campaign:${f.campaign}`;
        const label = `${this.channelName(f.source)} · ${f.campaign}`;
        (acq.get(key) ?? acq.set(key, { label, members: [] }).get(key)!).members.push(f.customerId);
      }
      if (f.term) {
        const key = `acq:${f.source}:term:${f.term}`;
        const label = `${this.channelName(f.source)} · "${f.term}"`;
        (acq.get(key) ?? acq.set(key, { label, members: [] }).get(key)!).members.push(f.customerId);
      }
    }
    for (const [key, c] of acq) {
      if (c.members.length < ACQ_MIN_SIZE) continue;
      cohorts.push({
        key,
        kind: 'ACQUISITION',
        label: c.label,
        signature: { channel: key.split(':')[1], size: c.members.length },
        members: c.members.map((customerId) => ({ customerId, weight: 1 })),
      });
    }

    // 3) Search-intent cohorts (what shoppers searched for on the store).
    const search = new Map<string, Set<string>>();
    for (const f of feats) {
      for (const q of f.searchTerms) {
        (search.get(q) ?? search.set(q, new Set()).get(q)!).add(f.customerId);
      }
    }
    for (const [q, members] of search) {
      if (members.size < ACQ_MIN_SIZE) continue;
      cohorts.push({
        key: `search:${q}`,
        kind: 'SEARCH_INTENT',
        label: `Searched "${q}"`,
        signature: { query: q, size: members.size },
        members: [...members].map((customerId) => ({ customerId, weight: 1 })),
      });
    }

    // Persist.
    for (const c of cohorts) {
      await this.prisma.cohort.create({
        data: {
          tenantId: ctx.tenantId,
          storeId,
          kind: c.kind,
          key: c.key,
          label: c.label,
          signature: c.signature,
          size: c.members.length,
          members: { create: c.members.map((m) => ({ tenantId: ctx.tenantId, customerId: m.customerId, weight: m.weight })) },
        },
      });
    }
    // Mark the recompute time so the scheduled cadence (manual or worker) advances.
    await this.prisma.store.update({ where: { id: storeId }, data: { cohortsRecomputedAt: new Date() } });
    return {
      cohorts: cohorts.length,
      behavioral: cohorts.filter((c) => c.kind === 'BEHAVIORAL').length,
      acquisition: cohorts.filter((c) => c.kind === 'ACQUISITION').length,
      searchIntent: cohorts.filter((c) => c.kind === 'SEARCH_INTENT').length,
      customers: feats.length,
    };
  }

  // --- Scheduled recompute (cadence by daily visitor volume) ----------------

  /** Average distinct daily visitors over the last 7 days (smoothed). */
  private async avgDailyVisitors(storeId: string, now = Date.now()): Promise<number> {
    const since = new Date(now - 7 * DAY_MS);
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(DISTINCT "anonymousId")::int AS count
      FROM "BehaviorEvent"
      WHERE "storeId" = ${storeId} AND "createdAt" >= ${since} AND "anonymousId" IS NOT NULL
    `;
    return Number(rows[0]?.count ?? 0) / 7;
  }

  /** Recompute cadence by traffic: ≥10k/day nightly, ≥1k weekly, else monthly. */
  cadence(avgDailyVisitors: number): { cadence: 'DAILY' | 'WEEKLY' | 'MONTHLY'; intervalDays: number } {
    if (avgDailyVisitors >= 10000) return { cadence: 'DAILY', intervalDays: 1 };
    if (avgDailyVisitors >= 1000) return { cadence: 'WEEKLY', intervalDays: 7 };
    return { cadence: 'MONTHLY', intervalDays: 30 };
  }

  /** The store's cohort recompute schedule (for display). */
  async scheduleStatus(ctx: TenantContext, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, tenantId: ctx.tenantId }, select: { cohortsRecomputedAt: true } });
    if (!store) throw new NotFoundError('Store', storeId);
    const avg = await this.avgDailyVisitors(storeId);
    const { cadence, intervalDays } = this.cadence(avg);
    const last = store.cohortsRecomputedAt;
    const nextDueAt = last ? new Date(last.getTime() + intervalDays * DAY_MS) : null;
    return {
      avgDailyVisitors: Math.round(avg * 10) / 10,
      cadence,
      intervalDays,
      lastRecomputedAt: last,
      nextDueAt,
      dueNow: !last || Date.now() >= (nextDueAt?.getTime() ?? 0),
    };
  }

  /**
   * Worker job (cross-tenant): recompute cohorts for every store whose cadence
   * is due. Cadence is chosen per store from its recent daily visitor volume,
   * so high-traffic stores refresh nightly and quiet ones monthly.
   */
  async runDueRecomputes(now: Date = new Date()): Promise<{ scanned: number; recomputed: number }> {
    const stores = await this.prisma.store.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, tenantId: true, cohortsRecomputedAt: true },
    });
    let recomputed = 0;
    for (const s of stores) {
      // Skip stores with no customers (nothing to cluster).
      const customers = await this.prisma.customer.count({ where: { storeId: s.id } });
      if (!customers) continue;
      const avg = await this.avgDailyVisitors(s.id, now.getTime());
      const { intervalDays } = this.cadence(avg);
      const due = !s.cohortsRecomputedAt || now.getTime() - s.cohortsRecomputedAt.getTime() >= intervalDays * DAY_MS;
      if (!due) continue;
      await this.recompute({ tenantId: s.tenantId }, s.id).catch(() => undefined);
      recomputed++;
    }
    return { scanned: stores.length, recomputed };
  }

  private normalizeQuery(q: string | null | undefined): string | null {
    if (!q) return null;
    const s = q.trim().toLowerCase().replace(/\s+/g, ' ');
    return s.length >= 2 ? s.slice(0, 60) : null;
  }

  private channelName(source: string) {
    return source === 'meta' ? 'Meta' : source === 'google' ? 'Google' : source === 'direct' ? 'Direct' : source.charAt(0).toUpperCase() + source.slice(1);
  }

  private labelBehavioral(members: Feat[]): string {
    const avg = (sel: (f: Feat) => number) => members.reduce((a, f) => a + sel(f), 0) / members.length;
    const sourceCounts = new Map<string, number>();
    for (const f of members) sourceCounts.set(f.source, (sourceCounts.get(f.source) ?? 0) + 1);
    const channel = this.channelName([...sourceCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]);
    const avgOrders = avg((f) => f.orders);
    const avgCarts = avg((f) => f.carts);
    const avgViews = avg((f) => f.views);
    const avgSpend = avg((f) => f.spendMinor);

    let behaviour: string;
    if (avgOrders >= 1) behaviour = avgSpend >= 300000 ? 'High-value buyers' : 'Buyers';
    else if (avgCarts >= 0.5) behaviour = 'Cart abandoners';
    else if (avgViews >= 1) behaviour = 'Browsers';
    else behaviour = 'New visitors';
    return `${behaviour} · ${channel}`;
  }

  private signature(members: Feat[]) {
    const avg = (sel: (f: Feat) => number) => Math.round((members.reduce((a, f) => a + sel(f), 0) / members.length) * 100) / 100;
    const channels: Record<string, number> = {};
    for (const f of members) channels[f.source] = (channels[f.source] ?? 0) + 1;
    return {
      size: members.length,
      channels,
      avgOrders: avg((f) => f.orders),
      avgSpendMinor: Math.round(avg((f) => f.spendMinor)),
      avgViews: avg((f) => f.views),
      avgCarts: avg((f) => f.carts),
    };
  }

  // --- Reads ----------------------------------------------------------------

  async list(ctx: TenantContext, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, tenantId: ctx.tenantId }, select: { id: true } });
    if (!store) throw new NotFoundError('Store', storeId);
    const cohorts = await this.prisma.cohort.findMany({ where: { tenantId: ctx.tenantId, storeId }, orderBy: [{ kind: 'asc' }, { size: 'desc' }] });
    return cohorts.map((c) => ({ id: c.id, key: c.key, kind: c.kind, label: c.label, size: c.size, signature: c.signature }));
  }

  /** Cohorts a customer belongs to (multi-membership) + their temperature. */
  async forCustomer(ctx: TenantContext, customerId: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, tenantId: ctx.tenantId }, select: { id: true, storeId: true, acqSource: true, acqCampaign: true, acqTerm: true } });
    if (!customer) throw new NotFoundError('Customer', customerId);
    const memberships = await this.prisma.cohortMembership.findMany({
      where: { tenantId: ctx.tenantId, customerId },
      include: { cohort: { select: { key: true, kind: true, label: true, size: true } } },
      orderBy: { weight: 'desc' },
    });
    const lastOrder = await this.prisma.order.aggregate({ where: { customerId, status: { in: [...PAID] } }, _max: { createdAt: true } });
    return {
      temperature: this.temperatureFor(lastOrder._max.createdAt ?? null),
      acquisition: { source: customer.acqSource, campaign: customer.acqCampaign, term: customer.acqTerm },
      cohorts: memberships.map((m) => ({ key: m.cohort.key, kind: m.cohort.kind, label: m.cohort.label, size: m.cohort.size, weight: Math.round(m.weight * 1000) / 1000 })),
    };
  }

  // --- Recommendations ("others in your cohort bought") ---------------------

  async recommendations(ctx: TenantContext, customerId: string, limit = 6) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, tenantId: ctx.tenantId }, select: { id: true, storeId: true } });
    if (!customer) throw new NotFoundError('Customer', customerId);

    const myMemberships = await this.prisma.cohortMembership.findMany({ where: { tenantId: ctx.tenantId, customerId }, select: { cohortId: true, weight: true } });
    if (!myMemberships.length) return { recommendations: [] as any[] };
    const cohortWeight = new Map(myMemberships.map((m) => [m.cohortId, m.weight]));

    // Other members of those cohorts, with the summed weight of shared cohorts.
    const others = await this.prisma.cohortMembership.findMany({
      where: { cohortId: { in: myMemberships.map((m) => m.cohortId) }, customerId: { not: customerId } },
      select: { customerId: true, cohortId: true, weight: true },
    });
    const peerWeight = new Map<string, number>();
    for (const o of others) peerWeight.set(o.customerId, (peerWeight.get(o.customerId) ?? 0) + (cohortWeight.get(o.cohortId) ?? 0) * o.weight);
    if (!peerWeight.size) return { recommendations: [] as any[] };

    // Products the target already bought (exclude from recs).
    const mine = await this.prisma.order.findMany({ where: { customerId, status: { in: [...PAID] } }, select: { items: { select: { variant: { select: { productId: true } } } } } });
    const owned = new Set<string>();
    for (const o of mine) for (const it of o.items) if (it.variant?.productId) owned.add(it.variant.productId);

    // Score products by what peers bought, weighted by peer affinity.
    const peerOrders = await this.prisma.order.findMany({
      where: { storeId: customer.storeId, customerId: { in: [...peerWeight.keys()] }, status: { in: [...PAID] } },
      select: { customerId: true, items: { select: { variant: { select: { productId: true } } } } },
    });
    const score = new Map<string, number>();
    for (const o of peerOrders) {
      const w = peerWeight.get(o.customerId!) ?? 0;
      for (const it of o.items) {
        const pid = it.variant?.productId;
        if (!pid || owned.has(pid)) continue;
        score.set(pid, (score.get(pid) ?? 0) + w);
      }
    }
    const ranked = [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
    if (!ranked.length) return { recommendations: [] as any[] };

    const products = await this.prisma.product.findMany({
      where: { id: { in: ranked.map(([id]) => id) } },
      include: { variants: { take: 1, orderBy: { priceMinor: 'asc' } } },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    return {
      recommendations: ranked
        .map(([pid, s]) => {
          const p = byId.get(pid);
          if (!p) return null;
          return { productId: pid, title: p.title, score: Math.round(s * 1000) / 1000, priceMinor: p.variants[0]?.priceMinor ?? null, currency: p.variants[0]?.currency ?? 'INR' };
        })
        .filter(Boolean),
    };
  }
}
