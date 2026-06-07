import type { PrismaClient } from '@prisma/client';
import { NotFoundError, type TenantContext } from '../context.js';
import type { StockService } from './stock.service.js';
import type { SeoService } from './seo.service.js';
import type { PricingService } from './pricing.service.js';
import type { ReviewService } from './review.service.js';
import type { ReturnService } from './return.service.js';
import type { IntegrationService } from './integration.service.js';
import type { LegalService } from './legal.service.js';
import type { NotificationService } from './notification.service.js';

/**
 * Store Operations Advisor — a DETERMINISTIC engine that inspects a store's live
 * state and emits a prioritized list of "what to do next" recommendations, each
 * carrying an executable action (the exact MCP tool + args an agent can run to
 * fix it). No LLM: every recommendation comes from fixed thresholds + the same
 * domain services the rest of the platform uses, so identical state always
 * yields identical guidance — which is what makes it safe for agents to act on.
 */

export type Severity = 'critical' | 'warning' | 'opportunity';
export type AdvisorCategory =
  | 'readiness' | 'inventory' | 'fulfillment' | 'catalog'
  | 'seo' | 'pricing' | 'reviews' | 'returns' | 'engagement';

export interface ExecutableAction {
  label: string;
  tool: string;                    // MCP tool name, e.g. 'receive_stock'
  rest?: { method: string; path: string };
  args: Record<string, unknown>;   // ready-to-run
}

export interface Recommendation {
  code: string;                    // stable, e.g. 'INVENTORY_OUT_OF_STOCK'
  category: AdvisorCategory;
  severity: Severity;
  title: string;
  detail: string;
  evidence: Record<string, unknown>;
  impact: number;                  // 0..100 sort weight
  action?: ExecutableAction;
}

export interface StoreAdvisory {
  storeId: string;
  generatedAt: string;
  health: { score: number; grade: 'A' | 'B' | 'C' | 'D'; readiness: number; summary: string };
  counts: { critical: number; warning: number; opportunity: number };
  recommendations: Recommendation[];
}

// All tunable thresholds in one place — the knobs that make this deterministic.
export const ADVISOR_THRESHOLDS = {
  paidSlaHours: 48,        // PAID but unfulfilled beyond this → flag
  stalePendingHours: 72,   // PENDING payment older than this → flag
  seoScoreFloor: 80,       // SEO audit score below this → flag
  maxPerCheck: 8,          // cap per-item recommendations to avoid flooding
  reorderCoverDays: 30,    // suggested restock = ~this many days of cover
  reorderFallbackQty: 20,  // when velocity is unknown
} as const;

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, opportunity: 2 };

export class AdvisorService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly stock: StockService,
    private readonly seo: SeoService,
    private readonly pricing: PricingService,
    private readonly reviews: ReviewService,
    private readonly returns: ReturnService,
    private readonly integrations: IntegrationService,
    private readonly legal: LegalService,
    private readonly notifications?: NotificationService,
  ) {}

  /** Run the full deterministic check battery for a store. */
  async evaluate(ctx: TenantContext, storeId: string): Promise<StoreAdvisory> {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, tenantId: ctx.tenantId },
      select: { id: true, name: true, status: true, gstin: true },
    });
    if (!store) throw new NotFoundError('Store', storeId);

    // Readiness gates double as the readiness score; checks below add findings.
    const { recs: readinessRecs, readiness } = await this.checkReadiness(ctx, store);

    const groups = await Promise.all([
      this.checkInventory(ctx, storeId),
      this.checkFulfillment(storeId),
      this.checkCatalog(storeId),
      this.checkSeo(ctx, storeId),
      this.checkPricing(ctx, storeId),
      this.checkReviews(ctx, storeId),
      this.checkReturns(ctx, storeId),
      this.checkEngagement(storeId),
    ]);

    const recommendations = [readinessRecs, ...groups].flat();
    recommendations.sort(
      (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.impact - a.impact || a.code.localeCompare(b.code),
    );

    const counts = {
      critical: recommendations.filter((r) => r.severity === 'critical').length,
      warning: recommendations.filter((r) => r.severity === 'warning').length,
      opportunity: recommendations.filter((r) => r.severity === 'opportunity').length,
    };
    const score = Math.max(0, Math.min(100, Math.round(readiness) - counts.critical * 10 - counts.warning * 4));
    const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D';
    const summary =
      counts.critical > 0
        ? `${counts.critical} critical issue${counts.critical === 1 ? '' : 's'} need attention.`
        : counts.warning > 0
          ? `${counts.warning} thing${counts.warning === 1 ? '' : 's'} to tidy up.`
          : recommendations.length > 0
            ? `Healthy — ${recommendations.length} growth opportunit${recommendations.length === 1 ? 'y' : 'ies'}.`
            : 'Everything looks healthy.';

    return {
      storeId,
      generatedAt: new Date().toISOString(),
      health: { score, grade, readiness: Math.round(readiness), summary },
      counts,
      recommendations,
    };
  }

  // --- Checks (each deterministic) ------------------------------------------

  private async checkReadiness(
    ctx: TenantContext,
    store: { id: string; name: string; status: string; gstin: string | null },
  ): Promise<{ recs: Recommendation[]; readiness: number }> {
    const storeId = store.id;
    const [integrations, legal, activeProducts] = await Promise.all([
      this.integrations.list(ctx, storeId),
      this.legal.list(ctx, storeId),
      this.prisma.product.count({ where: { storeId, status: 'ACTIVE' } }),
    ]);

    const hasPayment = integrations.some((i) => i.kind === 'PAYMENT' && i.enabled);
    const hasShipping = integrations.some((i) => i.kind === 'SHIPPING' && i.enabled);
    const hasLegal = legal.some((p: any) => p.status === 'PUBLISHED');
    const hasTax = Boolean(store.gstin);
    const hasProducts = activeProducts > 0;
    const isActive = store.status === 'ACTIVE';

    const gates = [hasPayment, hasProducts, hasLegal, hasTax, hasShipping, isActive];
    const readiness = (gates.filter(Boolean).length / gates.length) * 100;

    const recs: Recommendation[] = [];
    if (!isActive) {
      recs.push({ code: 'READINESS_STORE_SUSPENDED', category: 'readiness', severity: 'critical', impact: 100,
        title: 'Store is suspended', detail: 'This store is not ACTIVE, so it cannot take orders. Contact support to restore it.',
        evidence: { status: store.status } });
    }
    if (!hasPayment) {
      recs.push({ code: 'READINESS_NO_PAYMENT', category: 'readiness', severity: 'critical', impact: 98,
        title: 'No payment provider configured', detail: 'Shoppers cannot pay. Configure Razorpay or GoKwik to start accepting orders.',
        evidence: {},
        action: { label: 'Configure a payment provider', tool: 'configure_payment_provider', rest: { method: 'POST', path: '/integrations' }, args: { storeId } } });
    }
    if (!hasProducts) {
      recs.push({ code: 'READINESS_NO_PRODUCTS', category: 'readiness', severity: 'critical', impact: 95,
        title: 'No active products', detail: 'Your store has nothing to sell. Add and activate at least one product.',
        evidence: { activeProducts },
        action: { label: 'Create a product', tool: 'create_product', rest: { method: 'POST', path: '/products' }, args: { storeId } } });
    }
    if (!hasLegal) {
      recs.push({ code: 'READINESS_NO_LEGAL', category: 'readiness', severity: 'warning', impact: 70,
        title: 'No published legal policies', detail: 'Publish Terms, Privacy, Shipping and Refund policies to build buyer trust and meet marketplace requirements.',
        evidence: {},
        action: { label: 'Generate & publish policies', tool: 'generate_legal_policies', rest: { method: 'POST', path: `/legal/generate-all` }, args: { storeId, publish: true } } });
    }
    if (!hasTax) {
      recs.push({ code: 'READINESS_NO_TAX_IDENTITY', category: 'readiness', severity: 'warning', impact: 60,
        title: 'No GST identity set', detail: 'Add your GSTIN so orders generate correct GST tax invoices (CGST/SGST/IGST).',
        evidence: {},
        action: { label: 'Set tax identity', tool: 'set_store_tax_identity', rest: { method: 'POST', path: `/stores/${storeId}/tax-identity` }, args: { storeId } } });
    }
    if (!hasShipping) {
      recs.push({ code: 'READINESS_NO_SHIPPING', category: 'readiness', severity: 'opportunity', impact: 45,
        title: 'No shipping provider configured', detail: 'Connect Delhivery (or another courier) to print labels and give buyers live tracking.',
        evidence: {},
        action: { label: 'Configure shipping', tool: 'configure_shipping', rest: { method: 'POST', path: '/integrations' }, args: { storeId } } });
    }
    return { recs, readiness };
  }

  private async checkInventory(ctx: TenantContext, storeId: string): Promise<Recommendation[]> {
    const statuses = await this.stock.getStockStatus(ctx, storeId);
    if (!statuses.length) return [];
    // Variants currently in an open (PENDING/PAID) order — a stockout there is critical.
    const openItems = await this.prisma.orderItem.findMany({
      where: { order: { storeId, status: { in: ['PENDING', 'PAID'] } }, variantId: { not: null } },
      select: { variantId: true },
    });
    const openVariantIds = new Set(openItems.map((i) => i.variantId));

    const reorderQty = (v: { dailyVelocity?: number }) =>
      v.dailyVelocity && v.dailyVelocity > 0
        ? Math.ceil(v.dailyVelocity * ADVISOR_THRESHOLDS.reorderCoverDays)
        : ADVISOR_THRESHOLDS.reorderFallbackQty;
    const restockAction = (v: any): ExecutableAction => ({
      label: `Restock ${v.sku ?? v.productTitle}`,
      tool: 'receive_stock', rest: { method: 'POST', path: '/stock/receive' },
      args: { variantId: v.variantId, quantity: reorderQty(v) },
    });

    const out = statuses.filter((v) => v.status === 'RED' && v.available <= 0);
    const criticalLow = statuses.filter((v) => v.status === 'RED' && v.available > 0);
    const low = statuses.filter((v) => v.status === 'AMBER');
    const recs: Recommendation[] = [];

    for (const v of out.slice(0, ADVISOR_THRESHOLDS.maxPerCheck)) {
      const inOpenOrder = openVariantIds.has(v.variantId);
      recs.push({
        code: 'INVENTORY_OUT_OF_STOCK', category: 'inventory', severity: inOpenOrder ? 'critical' : 'warning',
        impact: inOpenOrder ? 92 : 75,
        title: `Out of stock: ${v.productTitle}${v.title ? ` (${v.title})` : ''}`,
        detail: inOpenOrder
          ? 'This variant is sold out and appears in an unfulfilled order — restock to avoid a cancellation.'
          : 'This variant is sold out and cannot be purchased. Restock to resume sales.',
        evidence: { variantId: v.variantId, sku: v.sku, available: v.available, inOpenOrder },
        action: restockAction(v),
      });
    }
    for (const v of criticalLow.slice(0, ADVISOR_THRESHOLDS.maxPerCheck)) {
      recs.push({
        code: 'INVENTORY_CRITICAL_LOW', category: 'inventory', severity: 'warning', impact: 65,
        title: `Critically low: ${v.productTitle}${v.title ? ` (${v.title})` : ''}`,
        detail: `Only ${v.available} left (at or below the reorder point). Restock soon to avoid a stockout.`,
        evidence: { variantId: v.variantId, sku: v.sku, available: v.available, daysOfCover: v.daysOfCover },
        action: restockAction(v),
      });
    }
    if (low.length) {
      recs.push({
        code: 'INVENTORY_LOW', category: 'inventory', severity: 'opportunity', impact: 40,
        title: `${low.length} product${low.length === 1 ? '' : 's'} running low`,
        detail: 'These variants are trending toward a stockout based on recent sales velocity. Plan a restock.',
        evidence: { count: low.length, variantIds: low.slice(0, 20).map((v) => v.variantId) },
        action: { label: 'Review stock status', tool: 'get_stock_status', rest: { method: 'GET', path: `/stock/status?storeId=${storeId}` }, args: { storeId } },
      });
    }
    return recs;
  }

  private async checkFulfillment(storeId: string): Promise<Recommendation[]> {
    const now = Date.now();
    const recs: Recommendation[] = [];
    const paid = await this.prisma.order.findMany({
      where: { storeId, status: 'PAID' },
      select: { id: true, number: true, updatedAt: true },
      orderBy: { updatedAt: 'asc' },
    });
    const stuck = paid.filter((o) => now - o.updatedAt.getTime() > ADVISOR_THRESHOLDS.paidSlaHours * 3_600_000);
    for (const o of stuck.slice(0, ADVISOR_THRESHOLDS.maxPerCheck)) {
      const hours = Math.floor((now - o.updatedAt.getTime()) / 3_600_000);
      recs.push({
        code: 'FULFILLMENT_SLA_BREACH', category: 'fulfillment', severity: 'warning', impact: 80,
        title: `Order #${o.number} paid ${hours}h ago, not shipped`,
        detail: `This order has been paid for ${hours} hours (SLA ${ADVISOR_THRESHOLDS.paidSlaHours}h). Create a shipment to keep the buyer happy.`,
        evidence: { orderId: o.id, number: o.number, hoursSincePaid: hours },
        action: { label: `Ship order #${o.number}`, tool: 'create_shipment', rest: { method: 'POST', path: '/shipments' }, args: { orderId: o.id } },
      });
    }

    const stale = await this.prisma.order.count({
      where: { storeId, status: 'PENDING', createdAt: { lt: new Date(now - ADVISOR_THRESHOLDS.stalePendingHours * 3_600_000) } },
    });
    if (stale > 0) {
      recs.push({
        code: 'FULFILLMENT_STALE_PENDING', category: 'fulfillment', severity: 'opportunity', impact: 35,
        title: `${stale} unpaid order${stale === 1 ? '' : 's'} stuck pending`,
        detail: `These never completed payment after ${ADVISOR_THRESHOLDS.stalePendingHours}h. Follow up or let cart recovery nudge them.`,
        evidence: { count: stale },
        action: { label: 'Review cart recovery', tool: 'get_cart_recovery_policy', rest: { method: 'GET', path: `/carts/recovery-policy?storeId=${storeId}` }, args: { storeId } },
      });
    }
    return recs;
  }

  private async checkCatalog(storeId: string): Promise<Recommendation[]> {
    const recs: Recommendation[] = [];
    const draft = await this.prisma.product.count({ where: { storeId, status: 'DRAFT' } });
    if (draft > 0) {
      recs.push({
        code: 'CATALOG_DRAFT_PRODUCTS', category: 'catalog', severity: 'opportunity', impact: 50,
        title: `${draft} product${draft === 1 ? '' : 's'} still in draft`,
        detail: 'Draft products are invisible to shoppers. Publish the ones that are ready to sell.',
        evidence: { draft },
        action: { label: 'Publish drafts', tool: 'update_product', rest: { method: 'PATCH', path: '/products/:id' }, args: { status: 'ACTIVE' } },
      });
    }
    // Active products with no priced variant can't be bought.
    const unpurchasable = await this.prisma.product.count({
      where: { storeId, status: 'ACTIVE', variants: { none: { priceMinor: { gt: 0 } } } },
    });
    if (unpurchasable > 0) {
      recs.push({
        code: 'CATALOG_UNPURCHASABLE', category: 'catalog', severity: 'warning', impact: 68,
        title: `${unpurchasable} active product${unpurchasable === 1 ? '' : 's'} have no price`,
        detail: 'These are live but have no priced variant, so they cannot be added to cart. Set a price.',
        evidence: { count: unpurchasable },
        action: { label: 'Fix product pricing', tool: 'update_variant', rest: { method: 'PATCH', path: '/products/:id' }, args: { storeId } },
      });
    }
    return recs;
  }

  private async checkSeo(ctx: TenantContext, storeId: string): Promise<Recommendation[]> {
    const audit = await this.seo.audit(ctx, storeId).catch(() => null);
    if (!audit || (audit.counts.errors === 0 && audit.score >= ADVISOR_THRESHOLDS.seoScoreFloor)) return [];
    const severity: Severity = audit.counts.errors > 0 ? 'warning' : 'opportunity';
    return [{
      code: 'SEO_NEEDS_WORK', category: 'seo', severity, impact: Math.min(70, 100 - audit.score),
      title: `SEO score ${audit.score}/100`,
      detail: `${audit.counts.errors} error${audit.counts.errors === 1 ? '' : 's'} and ${audit.counts.warnings} warning${audit.counts.warnings === 1 ? '' : 's'} across products, pages and images. Fixing titles, descriptions and alt text improves search ranking.`,
      evidence: { score: audit.score, errors: audit.counts.errors, warnings: audit.counts.warnings },
      action: { label: 'Run SEO audit', tool: 'seo_audit', rest: { method: 'GET', path: `/seo/audit?storeId=${storeId}` }, args: { storeId } },
    }];
  }

  private async checkPricing(ctx: TenantContext, storeId: string): Promise<Recommendation[]> {
    const analysis = await this.pricing.analyze(ctx, storeId).catch(() => null);
    if (!analysis) return [];
    const { summary } = analysis;
    const recs: Recommendation[] = [];
    if (summary.belowMargin > 0) {
      recs.push({
        code: 'PRICING_BELOW_MARGIN', category: 'pricing', severity: 'warning', impact: 72,
        title: `${summary.belowMargin} product${summary.belowMargin === 1 ? '' : 's'} below your margin floor`,
        detail: 'These are priced below your minimum margin. Reprice to protect profitability.',
        evidence: { belowMargin: summary.belowMargin },
        action: { label: 'Run repricing', tool: 'run_repricing', rest: { method: 'POST', path: '/pricing/reprice' }, args: { storeId, apply: false } },
      });
    }
    if (summary.tracked > 0 && summary.expensive > 0) {
      recs.push({
        code: 'PRICING_ABOVE_MARKET', category: 'pricing', severity: 'opportunity', impact: 38,
        title: `${summary.expensive} product${summary.expensive === 1 ? '' : 's'} priced above all competitors`,
        detail: 'You may be leaving conversions on the table. Review competitive pricing.',
        evidence: { expensive: summary.expensive, tracked: summary.tracked },
        action: { label: 'Analyze pricing', tool: 'analyze_pricing', rest: { method: 'GET', path: `/pricing/analyze?storeId=${storeId}` }, args: { storeId } },
      });
    }
    return recs;
  }

  private async checkReviews(ctx: TenantContext, storeId: string): Promise<Recommendation[]> {
    const counts = await this.reviews.counts(ctx, storeId).catch(() => null);
    if (!counts || counts.PENDING <= 0) return [];
    return [{
      code: 'REVIEWS_PENDING_MODERATION', category: 'reviews', severity: 'warning', impact: 55,
      title: `${counts.PENDING} review${counts.PENDING === 1 ? '' : 's'} awaiting moderation`,
      detail: 'Approve or reject pending reviews so social proof shows on your product pages.',
      evidence: { pending: counts.PENDING },
      action: { label: 'Moderate reviews', tool: 'list_reviews', rest: { method: 'GET', path: `/reviews?storeId=${storeId}&status=PENDING` }, args: { storeId, status: 'PENDING' } },
    }];
  }

  private async checkReturns(ctx: TenantContext, storeId: string): Promise<Recommendation[]> {
    const counts = await this.returns.counts(ctx, storeId).catch(() => null);
    if (!counts || counts.REQUESTED <= 0) return [];
    return [{
      code: 'RETURNS_AWAITING_ACTION', category: 'returns', severity: 'warning', impact: 62,
      title: `${counts.REQUESTED} return${counts.REQUESTED === 1 ? '' : 's'} awaiting your decision`,
      detail: 'Buyers are waiting on these return requests. Approve or reject them to keep trust high.',
      evidence: { requested: counts.REQUESTED },
      action: { label: 'Review returns', tool: 'list_returns', rest: { method: 'GET', path: `/returns?storeId=${storeId}&status=REQUESTED` }, args: { storeId, status: 'REQUESTED' } },
    }];
  }

  private async checkEngagement(storeId: string): Promise<Recommendation[]> {
    const recs: Recommendation[] = [];
    const recoverable = await this.prisma.cart.count({
      where: { storeId, status: 'ABANDONED', recoveryStepsSent: 0, OR: [{ contactEmail: { not: null } }, { contactPhone: { not: null } }] },
    });
    if (recoverable > 0) {
      recs.push({
        code: 'ENGAGEMENT_ABANDONED_CARTS', category: 'engagement', severity: 'opportunity', impact: 48,
        title: `${recoverable} recoverable abandoned cart${recoverable === 1 ? '' : 's'}`,
        detail: 'These shoppers left items behind and we have their contact. Turn on cart recovery to win them back.',
        evidence: { recoverable },
        action: { label: 'Enable cart recovery', tool: 'set_cart_recovery_policy', rest: { method: 'POST', path: '/carts/recovery-policy' }, args: { storeId, enabled: true } },
      });
    }
    const missingContact = await this.prisma.customer.count({ where: { storeId, email: null, phone: null } });
    if (missingContact > 0) {
      recs.push({
        code: 'ENGAGEMENT_MISSING_CONTACT', category: 'engagement', severity: 'opportunity', impact: 25,
        title: `${missingContact} customer${missingContact === 1 ? '' : 's'} with no contact details`,
        detail: 'Without an email or phone you cannot send order updates or re-marketing. Collect contact at checkout.',
        evidence: { missingContact },
        action: { label: 'Review checkout settings', tool: 'get_checkout_settings', rest: { method: 'GET', path: `/checkout-settings?storeId=${storeId}` }, args: { storeId } },
      });
    }
    return recs;
  }

  // --- Proactive owner notifications (worker) -------------------------------

  /**
   * Scan ACTIVE stores, evaluate each, and push CRITICAL recommendations to the
   * store owner — deduped via AdvisoryDispatch so the same alert isn't re-sent
   * within `dedupeHours`. Returns counts for the worker log.
   */
  async runDueAdvisories(opts: { dedupeHours?: number } = {}): Promise<{ scanned: number; dispatched: number }> {
    const dedupeMs = (opts.dedupeHours ?? 24) * 3_600_000;
    const stores = await this.prisma.store.findMany({
      where: { status: 'ACTIVE', tenant: { status: 'ACTIVE' } },
      select: { id: true, tenantId: true },
    });
    let dispatched = 0;
    for (const store of stores) {
      const ctx: TenantContext = { tenantId: store.tenantId };
      const advisory = await this.evaluate(ctx, store.id).catch(() => null);
      if (!advisory) continue;
      const criticals = advisory.recommendations.filter((r) => r.severity === 'critical');
      for (const rec of criticals) {
        const existing = await this.prisma.advisoryDispatch.findUnique({
          where: { storeId_code: { storeId: store.id, code: rec.code } },
        });
        if (existing && Date.now() - existing.lastSentAt.getTime() < dedupeMs) continue;
        await this.notifications
          ?.notify(ctx, { storeId: store.id, event: 'STORE_ADVISORY', recipientType: 'STORE_OWNER', data: { title: rec.title, detail: rec.detail } })
          .catch(() => undefined);
        await this.prisma.advisoryDispatch.upsert({
          where: { storeId_code: { storeId: store.id, code: rec.code } },
          create: { tenantId: store.tenantId, storeId: store.id, code: rec.code },
          update: { lastSentAt: new Date() },
        });
        dispatched++;
      }
    }
    return { scanned: stores.length, dispatched };
  }
}
