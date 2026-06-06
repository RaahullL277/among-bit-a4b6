import type { PrismaClient, RepricingStrategy } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';

export interface PricingRuleInput {
  storeId: string;
  enabled?: boolean;
  strategy?: RepricingStrategy;
  adjustValue?: number;
  adjustIsPercent?: boolean;
  minMarginPercent?: number;
  roundTo99?: boolean;
}

export interface AddCompetitorInput {
  variantId: string;
  competitorName: string;
  url?: string;
  priceMinor: number;
  inStock?: boolean;
}

const DEFAULT_RULE = {
  enabled: false,
  strategy: 'BEAT_LOWEST' as RepricingStrategy,
  adjustValue: 1,
  adjustIsPercent: true,
  minMarginPercent: 10,
  roundTo99: false,
};

type Rule = typeof DEFAULT_RULE;

/**
 * Pricing intelligence: tracks competitor prices, analyzes margins and market
 * position, and computes (and optionally applies) repricing per a store rule —
 * always bounded by a minimum-margin floor so a price war can't sell at a loss.
 */
export class PricingService {
  constructor(private readonly prisma: PrismaClient) {}

  private async assertStore(ctx: TenantContext, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, tenantId: ctx.tenantId }, select: { id: true } });
    if (!store) throw new NotFoundError('Store', storeId);
  }

  private async assertVariant(ctx: TenantContext, variantId: string) {
    const v = await this.prisma.productVariant.findFirst({
      where: { id: variantId, tenantId: ctx.tenantId },
      include: { product: { select: { storeId: true, title: true } } },
    });
    if (!v) throw new NotFoundError('ProductVariant', variantId);
    return v;
  }

  // --- Rules ----------------------------------------------------------------

  async getRule(ctx: TenantContext, storeId: string) {
    await this.assertStore(ctx, storeId);
    const row = await this.prisma.pricingRule.findUnique({ where: { storeId } });
    return row ?? { storeId, ...DEFAULT_RULE, isDefault: true };
  }

  private async rule(storeId: string): Promise<Rule> {
    const row = await this.prisma.pricingRule.findUnique({ where: { storeId } });
    return row ?? DEFAULT_RULE;
  }

  async setRule(ctx: TenantContext, input: PricingRuleInput) {
    await this.assertStore(ctx, input.storeId);
    if (input.minMarginPercent !== undefined && (input.minMarginPercent < 0 || input.minMarginPercent >= 100)) {
      throw new ValidationError('Minimum margin must be between 0 and 99 percent.');
    }
    if (input.adjustValue !== undefined && input.adjustValue < 0) throw new ValidationError('Adjust value must be non-negative.');
    const data = {
      enabled: input.enabled,
      strategy: input.strategy,
      adjustValue: input.adjustValue,
      adjustIsPercent: input.adjustIsPercent,
      minMarginPercent: input.minMarginPercent,
      roundTo99: input.roundTo99,
    };
    return this.prisma.pricingRule.upsert({
      where: { storeId: input.storeId },
      create: { tenantId: ctx.tenantId, storeId: input.storeId, ...DEFAULT_RULE, ...stripUndefined(data) },
      update: data,
    });
  }

  // --- Cost & competitors ---------------------------------------------------

  async setCost(ctx: TenantContext, variantId: string, costMinor: number) {
    await this.assertVariant(ctx, variantId);
    if (!Number.isFinite(costMinor) || costMinor < 0) throw new ValidationError('Cost must be a non-negative number.');
    return this.prisma.productVariant.update({ where: { id: variantId }, data: { costMinor: Math.round(costMinor) } });
  }

  async addCompetitor(ctx: TenantContext, input: AddCompetitorInput) {
    const v = await this.assertVariant(ctx, input.variantId);
    if (!input.competitorName?.trim()) throw new ValidationError('A competitor name is required.');
    if (!(input.priceMinor > 0)) throw new ValidationError('Competitor price must be positive.');
    return this.prisma.competitorPrice.create({
      data: {
        tenantId: ctx.tenantId,
        storeId: v.product.storeId,
        variantId: input.variantId,
        competitorName: input.competitorName.trim(),
        url: input.url,
        priceMinor: Math.round(input.priceMinor),
        inStock: input.inStock ?? true,
      },
    });
  }

  async listCompetitors(ctx: TenantContext, variantId: string) {
    await this.assertVariant(ctx, variantId);
    return this.prisma.competitorPrice.findMany({ where: { tenantId: ctx.tenantId, variantId }, orderBy: { priceMinor: 'asc' } });
  }

  async removeCompetitor(ctx: TenantContext, id: string) {
    const row = await this.prisma.competitorPrice.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true } });
    if (!row) throw new NotFoundError('CompetitorPrice', id);
    await this.prisma.competitorPrice.delete({ where: { id } });
    return { id, deleted: true };
  }

  /** Simulate a competitor-feed refresh by jittering tracked prices ±5%. */
  async refreshCompetitors(ctx: TenantContext, storeId: string) {
    await this.assertStore(ctx, storeId);
    const rows = await this.prisma.competitorPrice.findMany({ where: { tenantId: ctx.tenantId, storeId } });
    for (const r of rows) {
      const factor = 1 + (Math.random() * 0.1 - 0.05);
      await this.prisma.competitorPrice.update({
        where: { id: r.id },
        data: { priceMinor: Math.max(1, Math.round(r.priceMinor * factor)), checkedAt: new Date() },
      });
    }
    return { refreshed: rows.length };
  }

  // --- Margin & repricing math ----------------------------------------------

  private marginPercent(priceMinor: number, costMinor: number): number | null {
    if (priceMinor <= 0) return null;
    if (costMinor <= 0) return null; // unknown cost → margin not computable
    return Math.round(((priceMinor - costMinor) / priceMinor) * 1000) / 10;
  }

  /** Lowest price that still yields the rule's minimum margin off cost. */
  private marginFloor(costMinor: number, minMarginPercent: number): number {
    if (costMinor <= 0) return 0;
    const m = Math.min(99, Math.max(0, minMarginPercent)) / 100;
    return Math.ceil(costMinor / (1 - m));
  }

  private charm(priceMinor: number): number {
    // Round to the nearest rupee then end in .99 (e.g. 49850 → 49899? no → 49900-1).
    const rupees = Math.max(1, Math.round(priceMinor / 100));
    return rupees * 100 - 1;
  }

  /** The recommended price for one variant under a rule (clamped to margin). */
  private recommend(
    rule: Rule,
    variant: { priceMinor: number; costMinor: number },
    competitors: { priceMinor: number; inStock: boolean }[],
  ): number {
    const inStock = competitors.filter((c) => c.inStock).map((c) => c.priceMinor);
    const lowest = inStock.length ? Math.min(...inStock) : null;

    let target: number;
    if (rule.strategy === 'FIXED_MARGIN') {
      target = variant.costMinor > 0 ? this.marginFloor(variant.costMinor, rule.adjustValue) : variant.priceMinor;
    } else if (lowest === null) {
      target = variant.priceMinor; // no competitors → leave unchanged
    } else if (rule.strategy === 'MATCH_LOWEST') {
      target = lowest;
    } else {
      // BEAT_LOWEST
      const cut = rule.adjustIsPercent ? Math.round((lowest * rule.adjustValue) / 100) : rule.adjustValue;
      target = lowest - cut;
    }

    // Enforce the margin floor so repricing never sells below the minimum margin.
    const floor = this.marginFloor(variant.costMinor, rule.minMarginPercent);
    if (floor > 0) target = Math.max(target, floor);
    target = Math.max(1, Math.round(target));
    if (rule.roundTo99) target = this.charm(target);
    return target;
  }

  // --- Analysis -------------------------------------------------------------

  async analyze(ctx: TenantContext, storeId: string) {
    await this.assertStore(ctx, storeId);
    const rule = await this.rule(storeId);
    const variants = await this.prisma.productVariant.findMany({
      where: { tenantId: ctx.tenantId, product: { storeId, status: 'ACTIVE' } },
      include: { product: { select: { title: true } }, competitorPrices: true },
      orderBy: { priceMinor: 'desc' },
    });

    const items = variants.map((v) => {
      const comps = v.competitorPrices.filter((c) => c.inStock).map((c) => c.priceMinor);
      const lowest = comps.length ? Math.min(...comps) : null;
      const highest = comps.length ? Math.max(...comps) : null;
      const recommended = this.recommend(rule as Rule, v, v.competitorPrices);
      const position =
        lowest === null ? 'unknown' : v.priceMinor <= lowest ? 'cheapest' : highest !== null && v.priceMinor > highest ? 'expensive' : 'competitive';
      return {
        variantId: v.id,
        productTitle: v.product.title,
        variantTitle: v.title,
        currency: v.currency,
        priceMinor: v.priceMinor,
        costMinor: v.costMinor,
        marginPercent: this.marginPercent(v.priceMinor, v.costMinor),
        competitors: v.competitorPrices.length,
        lowestCompetitorMinor: lowest,
        highestCompetitorMinor: highest,
        position,
        recommendedPriceMinor: recommended,
        recommendedMarginPercent: this.marginPercent(recommended, v.costMinor),
        changeMinor: recommended - v.priceMinor,
      };
    });

    const tracked = items.filter((i) => i.competitors > 0).length;
    const belowMargin = items.filter((i) => i.marginPercent !== null && i.marginPercent < rule.minMarginPercent).length;
    return {
      rule: { ...rule },
      summary: {
        variants: items.length,
        tracked,
        cheapest: items.filter((i) => i.position === 'cheapest').length,
        expensive: items.filter((i) => i.position === 'expensive').length,
        belowMargin,
        repriceable: items.filter((i) => i.changeMinor !== 0).length,
      },
      items,
    };
  }

  /**
   * Compute repricing for a store and, when `apply`, write the new variant
   * prices. Only changed prices are written; the margin floor is always honored.
   */
  async reprice(ctx: TenantContext, storeId: string, opts: { apply?: boolean } = {}) {
    const analysis = await this.analyze(ctx, storeId);
    const changes = analysis.items
      .filter((i) => i.changeMinor !== 0)
      .map((i) => ({
        variantId: i.variantId,
        productTitle: i.productTitle,
        fromMinor: i.priceMinor,
        toMinor: i.recommendedPriceMinor,
        changeMinor: i.changeMinor,
        marginPercent: i.recommendedMarginPercent,
      }));

    if (opts.apply) {
      for (const c of changes) {
        await this.prisma.productVariant.update({ where: { id: c.variantId }, data: { priceMinor: c.toMinor } });
      }
    }
    return { applied: Boolean(opts.apply), count: changes.length, changes };
  }
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
