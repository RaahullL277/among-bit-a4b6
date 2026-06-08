import type { PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';
import type { PageService, PageSection } from './page.service.js';
import type { CohortService } from './cohort.service.js';

const PAID = ['PAID', 'FULFILLED'] as const;
const MIN_CONVERSIONS = 30; // min per-variant conversions before a stage can declare a winner

export interface VisitorContext {
  anonymousId?: string;
  customerId?: string;
  acquisition?: { source?: string | null; campaign?: string | null };
}

export interface ExperimentVariantInput {
  name: string;
  isControl?: boolean;
  weight?: number;
  sections?: PageSection[];
  metaTitle?: string;
  metaDescription?: string;
  themeOverride?: Record<string, unknown> | null;
  audienceKind?: 'ALL' | 'COHORT' | 'ACQUISITION_SOURCE' | 'ACQUISITION_CAMPAIGN';
  audienceValue?: string | null;
  priority?: number;
}

// Deterministic 0..99 bucket from a string (FNV-1a) — sticky A/B assignment with
// no per-visitor state. Same key always lands in the same bucket.
function bucket(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 100;
}

// Standard-normal CDF (Abramowitz–Stegun 26.2.17) for the z-test p-value.
function phi(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

/**
 * Storefront experiments. A StoreExperiment owns N variants of a page (+ theme)
 * on one slug; resolveExperience() assigns a visitor to a variant by either a
 * deterministic sticky SPLIT (A/B) or a TARGETED rule (cohort-if-known, else
 * UTM). results() reports a per-variant funnel, auto-selects the deepest metric
 * with enough signal, and runs a two-proportion z-test for significance.
 */
export class ExperimentService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly pages: PageService,
    private readonly cohorts: CohortService,
  ) {}

  private async assertStore(ctx: TenantContext, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, tenantId: ctx.tenantId }, select: { id: true } });
    if (!store) throw new NotFoundError('Store', storeId);
  }

  // --- Merchant / agent CRUD ------------------------------------------------

  async list(ctx: TenantContext, storeId: string) {
    await this.assertStore(ctx, storeId);
    return this.prisma.storeExperiment.findMany({
      where: { tenantId: ctx.tenantId, storeId },
      include: { variants: { orderBy: [{ isControl: 'desc' }, { createdAt: 'asc' }] } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(ctx: TenantContext, id: string) {
    const exp = await this.prisma.storeExperiment.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { variants: { orderBy: [{ isControl: 'desc' }, { createdAt: 'asc' }] } },
    });
    if (!exp) throw new NotFoundError('Experiment', id);
    return exp;
  }

  /**
   * Create an experiment for a slug. By default seeds a Control variant cloned
   * from the store's current published page at that slug (so "do nothing" is the
   * baseline) plus the provided challenger variants.
   */
  async create(
    ctx: TenantContext,
    input: { storeId: string; slug?: string; name: string; mode?: 'SPLIT' | 'TARGETED'; variants?: ExperimentVariantInput[] },
  ) {
    await this.assertStore(ctx, input.storeId);
    const slug = (input.slug ?? 'home').trim();
    if (!input.name?.trim()) throw new ValidationError('An experiment name is required.');
    const existing = await this.prisma.storeExperiment.findUnique({ where: { storeId_slug: { storeId: input.storeId, slug } } });
    if (existing) throw new ValidationError(`An experiment already exists for "${slug}". Edit or end it first.`);

    const control = await this.controlFromLivePage(input.storeId, slug);
    const variantInputs: ExperimentVariantInput[] = [{ name: 'Control', isControl: true, ...control }, ...(input.variants ?? [])];

    return this.prisma.storeExperiment.create({
      data: {
        tenantId: ctx.tenantId,
        storeId: input.storeId,
        slug,
        name: input.name.trim(),
        mode: input.mode ?? 'SPLIT',
        status: 'DRAFT',
        variants: { create: variantInputs.map((v) => this.variantData(ctx.tenantId, input.storeId, v)) },
      },
      include: { variants: true },
    });
  }

  async addVariant(ctx: TenantContext, experimentId: string, input: ExperimentVariantInput) {
    const exp = await this.get(ctx, experimentId);
    // A new variant clones the live page when no sections are supplied.
    const base = input.sections ? input : { ...input, ...(await this.controlFromLivePage(exp.storeId, exp.slug)) };
    return this.prisma.experimentVariant.create({ data: { experimentId, ...this.variantData(ctx.tenantId, exp.storeId, base) } });
  }

  async updateVariant(ctx: TenantContext, variantId: string, patch: Partial<ExperimentVariantInput>) {
    const v = await this.prisma.experimentVariant.findFirst({ where: { id: variantId, tenantId: ctx.tenantId } });
    if (!v) throw new NotFoundError('Variant', variantId);
    return this.prisma.experimentVariant.update({
      where: { id: variantId },
      data: {
        name: patch.name?.trim() ?? undefined,
        weight: patch.weight ?? undefined,
        sections: patch.sections ? (patch.sections as unknown as object) : undefined,
        metaTitle: patch.metaTitle ?? undefined,
        metaDescription: patch.metaDescription ?? undefined,
        themeOverride: patch.themeOverride === undefined ? undefined : (patch.themeOverride as unknown as object),
        audienceKind: patch.audienceKind ?? undefined,
        audienceValue: patch.audienceValue === undefined ? undefined : patch.audienceValue,
        priority: patch.priority ?? undefined,
      },
    });
  }

  async removeVariant(ctx: TenantContext, variantId: string) {
    const v = await this.prisma.experimentVariant.findFirst({ where: { id: variantId, tenantId: ctx.tenantId }, select: { id: true, isControl: true } });
    if (!v) throw new NotFoundError('Variant', variantId);
    if (v.isControl) throw new ValidationError('The control variant cannot be removed.');
    await this.prisma.experimentVariant.delete({ where: { id: variantId } });
    return { removed: true };
  }

  async setStatus(ctx: TenantContext, id: string, status: 'DRAFT' | 'RUNNING' | 'PAUSED' | 'ENDED') {
    const exp = await this.get(ctx, id);
    if (status === 'RUNNING' && exp.variants.length < 2) throw new ValidationError('Add at least one variant beyond Control before running.');
    return this.prisma.storeExperiment.update({
      where: { id },
      data: {
        status,
        startedAt: status === 'RUNNING' && !exp.startedAt ? new Date() : undefined,
        endedAt: status === 'ENDED' ? new Date() : undefined,
      },
    });
  }

  /** Apply a variant's content to the live published page + theme, then end. */
  async promoteWinner(ctx: TenantContext, experimentId: string, variantId: string) {
    const exp = await this.get(ctx, experimentId);
    const v = exp.variants.find((x) => x.id === variantId);
    if (!v) throw new NotFoundError('Variant', variantId);

    const sections = (Array.isArray(v.sections) ? v.sections : []) as unknown as PageSection[];
    const existing = (await this.pages.list(ctx, exp.storeId)).find((p) => p.slug === exp.slug);
    if (existing) await this.pages.update(ctx, existing.id, { storeId: exp.storeId, sections, metaTitle: v.metaTitle ?? undefined, metaDescription: v.metaDescription ?? undefined, status: 'PUBLISHED' });
    else await this.pages.create(ctx, { storeId: exp.storeId, slug: exp.slug, title: v.name, sections, status: 'PUBLISHED' });
    if (v.themeOverride && typeof v.themeOverride === 'object') await this.pages.setTheme(ctx, { storeId: exp.storeId, ...(v.themeOverride as any) });

    await this.prisma.storeExperiment.update({ where: { id: experimentId }, data: { status: 'ENDED', endedAt: new Date(), winningVariantId: variantId } });
    return { promoted: variantId, slug: exp.slug };
  }

  // --- Public resolution (storefront) ---------------------------------------

  /**
   * Resolve the page + theme a given visitor should see for a slug. Returns null
   * when no experiment is RUNNING (storefront falls back to the normal page).
   */
  async resolveExperience(storeId: string, slug: string, visitor: VisitorContext) {
    const exp = await this.prisma.storeExperiment.findFirst({
      where: { storeId, slug, status: 'RUNNING' },
      include: { variants: true },
    });
    if (!exp || exp.variants.length === 0) return null;

    const variant = exp.mode === 'TARGETED'
      ? await this.pickTargeted(exp.tenantId, exp.variants, visitor)
      : this.pickSplit(exp.id, exp.variants, visitor.anonymousId);

    const sections = await this.pages.renderSections(storeId, (Array.isArray(variant.sections) ? variant.sections : []) as unknown as PageSection[]);
    const baseTheme = await this.pages.publicTheme(storeId);
    const theme = { ...baseTheme, ...((variant.themeOverride as Record<string, unknown>) ?? {}) };

    return {
      experiment: { id: exp.id, mode: exp.mode, variantId: variant.id, variantName: variant.name, isControl: variant.isControl },
      page: { slug, title: variant.name, metaTitle: variant.metaTitle, metaDescription: variant.metaDescription, sections },
      theme,
    };
  }

  private pickSplit(experimentId: string, variants: any[], anonymousId?: string): any {
    const sorted = [...variants].sort((a, b) => (a.id < b.id ? -1 : 1)); // stable order
    const total = sorted.reduce((n, v) => n + Math.max(0, v.weight), 0) || sorted.length;
    let b = bucket(`${anonymousId ?? 'anon'}:${experimentId}`) * (total / 100);
    for (const v of sorted) {
      b -= Math.max(0, v.weight) || total / sorted.length;
      if (b < 0) return v;
    }
    return sorted.find((v) => v.isControl) ?? sorted[0];
  }

  private async pickTargeted(tenantId: string, variants: any[], visitor: VisitorContext): Promise<any> {
    const byPriority = [...variants].sort((a, b) => b.priority - a.priority);
    // 1) Known visitor → match a behavioural/search-intent cohort.
    if (visitor.customerId) {
      const profile = await this.cohorts.forCustomer({ tenantId }, visitor.customerId).catch(() => null);
      const keys = new Set((profile?.cohorts ?? []).map((c: any) => c.key));
      const hit = byPriority.find((v) => v.audienceKind === 'COHORT' && v.audienceValue && keys.has(v.audienceValue));
      if (hit) return hit;
    }
    // 2) Else acquisition (UTM) — works for anonymous first-timers.
    const src = visitor.acquisition?.source?.toLowerCase();
    const camp = visitor.acquisition?.campaign?.toLowerCase();
    const acq = byPriority.find((v) =>
      (v.audienceKind === 'ACQUISITION_SOURCE' && src && v.audienceValue?.toLowerCase() === src) ||
      (v.audienceKind === 'ACQUISITION_CAMPAIGN' && camp && v.audienceValue?.toLowerCase() === camp));
    if (acq) return acq;
    // 3) Fallback → the ALL/control variant.
    return byPriority.find((v) => v.audienceKind === 'ALL') ?? variants.find((v) => v.isControl) ?? variants[0];
  }

  // --- Results & statistics -------------------------------------------------

  async results(ctx: TenantContext, experimentId: string, opts: { minConversions?: number } = {}) {
    const exp = await this.get(ctx, experimentId);
    const minConv = opts.minConversions ?? MIN_CONVERSIONS;
    const variantIds = exp.variants.map((v) => v.id);

    // Behaviour funnel (distinct visitors per stage) + orders/revenue per variant.
    const [events, orders] = await Promise.all([
      this.prisma.behaviorEvent.findMany({
        where: { tenantId: ctx.tenantId, experimentVariantId: { in: variantIds } },
        select: { experimentVariantId: true, anonymousId: true, customerId: true, type: true },
      }),
      this.prisma.order.groupBy({
        by: ['experimentVariantId'],
        where: { tenantId: ctx.tenantId, experimentVariantId: { in: variantIds }, status: { in: [...PAID] } },
        _count: true,
        _sum: { totalMinor: true },
      }),
    ]);

    const stat = new Map<string, { exposed: Set<string>; clicked: Set<string>; carted: Set<string> }>();
    for (const id of variantIds) stat.set(id, { exposed: new Set(), clicked: new Set(), carted: new Set() });
    for (const e of events) {
      const s = stat.get(e.experimentVariantId!);
      if (!s) continue;
      const who = e.customerId ?? e.anonymousId ?? '';
      if (!who) continue;
      s.exposed.add(who);
      if (e.type === 'CLICK') s.clicked.add(who);
      if (e.type === 'ADD_TO_CART') s.carted.add(who);
    }
    const orderBy = new Map(orders.map((o) => [o.experimentVariantId, { orders: o._count, revenue: o._sum.totalMinor ?? 0 }]));

    const rows = exp.variants.map((v) => {
      const s = stat.get(v.id)!;
      const exposures = s.exposed.size;
      const clicks = s.clicked.size;
      const addToCart = s.carted.size;
      const o = orderBy.get(v.id) ?? { orders: 0, revenue: 0 };
      return {
        variantId: v.id, name: v.name, isControl: v.isControl,
        exposures, clicks, addToCart, paidOrders: o.orders, revenueMinor: o.revenue,
        clickRate: rate(clicks, exposures),
        addToCartRate: rate(addToCart, exposures),
        paidConversion: rate(o.orders, exposures),
        revenuePerVisitorMinor: exposures > 0 ? Math.round(o.revenue / exposures) : 0,
      };
    });

    // Auto-pick the deepest funnel stage every variant has enough signal for.
    const STAGES: { metric: string; conv: (r: any) => number }[] = [
      { metric: 'paidConversion', conv: (r) => r.paidOrders },
      { metric: 'addToCartRate', conv: (r) => r.addToCart },
      { metric: 'clickRate', conv: (r) => r.clicks },
    ];
    const primary = STAGES.find((st) => rows.every((r) => st.conv(r) >= minConv))?.metric ?? 'exposure';

    const control = rows.find((r) => r.isControl) ?? rows[0];
    const stage = STAGES.find((s) => s.metric === primary);
    const withStats = rows.map((r) => {
      if (!stage || r.variantId === control.variantId || primary === 'exposure') return { ...r, uplift: null, pValue: null, significant: false };
      const z = twoProp(stage.conv(r), r.exposures, stage.conv(control), control.exposures);
      const upliftBase = (r as any)[primary] || 0;
      const ctrlBase = (control as any)[primary] || 0;
      return { ...r, uplift: ctrlBase > 0 ? round((upliftBase - ctrlBase) / ctrlBase) : null, pValue: z.p, significant: z.p < 0.05 };
    });

    const winner = withStats
      .filter((r) => r.significant && (r as any)[primary] > ((control as any)[primary] ?? 0))
      .sort((a, b) => (b as any)[primary] - (a as any)[primary])[0];

    return {
      experiment: { id: exp.id, name: exp.name, slug: exp.slug, mode: exp.mode, status: exp.status },
      primaryMetric: primary,
      minConversions: minConv,
      variants: withStats,
      winnerVariantId: winner?.variantId ?? null,
      headline: control ? { revenuePerVisitorMinor: control.revenuePerVisitorMinor } : null,
    };
  }

  // --- Helpers --------------------------------------------------------------

  private async controlFromLivePage(storeId: string, slug: string): Promise<{ sections: PageSection[]; metaTitle?: string; metaDescription?: string }> {
    const page = await this.prisma.storePage.findFirst({ where: { storeId, slug }, select: { sections: true, metaTitle: true, metaDescription: true } });
    return {
      sections: (Array.isArray(page?.sections) ? page!.sections : []) as unknown as PageSection[],
      metaTitle: page?.metaTitle ?? undefined,
      metaDescription: page?.metaDescription ?? undefined,
    };
  }

  private variantData(tenantId: string, storeId: string, v: ExperimentVariantInput) {
    return {
      tenantId, storeId,
      name: v.name.trim(),
      isControl: v.isControl ?? false,
      weight: v.weight ?? 50,
      sections: (v.sections ?? []) as unknown as object,
      metaTitle: v.metaTitle,
      metaDescription: v.metaDescription,
      themeOverride: (v.themeOverride ?? undefined) as unknown as object | undefined,
      audienceKind: v.audienceKind ?? 'ALL',
      audienceValue: v.audienceValue ?? undefined,
      priority: v.priority ?? 0,
    };
  }
}

function rate(n: number, d: number): number {
  return d > 0 ? round(n / d) : 0;
}
function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}
function twoProp(c1: number, n1: number, c0: number, n0: number): { z: number; p: number } {
  if (n1 === 0 || n0 === 0) return { z: 0, p: 1 };
  const p1 = c1 / n1;
  const p0 = c0 / n0;
  const pp = (c1 + c0) / (n1 + n0);
  const se = Math.sqrt(pp * (1 - pp) * (1 / n1 + 1 / n0));
  if (se === 0) return { z: 0, p: 1 };
  const z = (p1 - p0) / se;
  const p = 2 * (1 - phi(Math.abs(z)));
  return { z: round(z), p: round(p) };
}
