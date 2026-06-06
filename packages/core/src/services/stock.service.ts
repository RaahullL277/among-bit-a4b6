import type { PrismaClient, StockStatus } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';
import { defaultStockScorer, type StockScorer } from '../stock/scorer.js';
import type { NotificationService } from './notification.service.js';

const DEFAULT_POLICY = {
  enabled: true,
  greenDays: 14,
  amberDays: 5,
  reorderPoint: 0,
  velocityWindowDays: 30,
  trackInventory: true,
  allowBackorder: false,
};

export interface VariantStock {
  variantId: string;
  productId: string;
  productTitle: string;
  title: string;
  sku: string | null;
  inventory: number;
  dailyVelocity: number;
  daysOfCover: number | null;
  status: StockStatus;
  reason: string;
  previousStatus: StockStatus | null;
}

/**
 * Stock health scoring (🔴/🟠/🟢) and low-stock alerting. Uses a pluggable
 * StockScorer (heuristic days-of-cover today, ML-ready) and the notification
 * system to alert store owners on degradation.
 */
export class StockService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly notifications: NotificationService,
    private readonly scorer: StockScorer = defaultStockScorer,
  ) {}

  private async assertStore(ctx: TenantContext, storeId: string) {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!store) throw new NotFoundError('Store', storeId);
  }

  private async resolvePolicy(storeId: string) {
    const row = await this.prisma.stockPolicy.findUnique({ where: { storeId } });
    return row ?? { storeId, ...DEFAULT_POLICY, isDefault: true };
  }

  /** Units sold per variant over the trailing window (paid/fulfilled orders). */
  private async velocityByVariant(
    tenantId: string,
    storeId: string,
    variantIds: string[],
    windowDays: number,
  ): Promise<Map<string, number>> {
    if (!variantIds.length) return new Map();
    const since = new Date(Date.now() - windowDays * 86_400_000);
    const items = await this.prisma.orderItem.findMany({
      where: {
        tenantId,
        variantId: { in: variantIds },
        order: { storeId, status: { in: ['PAID', 'FULFILLED'] }, createdAt: { gte: since } },
      },
      select: { variantId: true, quantity: true },
    });
    const map = new Map<string, number>();
    for (const it of items) {
      if (it.variantId) map.set(it.variantId, (map.get(it.variantId) ?? 0) + it.quantity);
    }
    return map;
  }

  /** Compute R/A/G status for every variant in a store. */
  async getStockStatus(ctx: TenantContext, storeId: string): Promise<VariantStock[]> {
    await this.assertStore(ctx, storeId);
    const policy = await this.resolvePolicy(storeId);
    const variants = await this.prisma.productVariant.findMany({
      where: { tenantId: ctx.tenantId, product: { storeId } },
      include: { product: { select: { title: true } } },
    });
    const velocity = await this.velocityByVariant(
      ctx.tenantId,
      storeId,
      variants.map((v) => v.id),
      policy.velocityWindowDays,
    );

    return variants.map((v) => {
      const dailyVelocity = (velocity.get(v.id) ?? 0) / policy.velocityWindowDays;
      const score = this.scorer.score({
        inventory: v.inventory,
        dailyVelocity,
        greenDays: policy.greenDays,
        amberDays: policy.amberDays,
        reorderPoint: policy.reorderPoint,
      });
      return {
        variantId: v.id,
        productId: v.productId,
        productTitle: v.product.title,
        title: v.title,
        sku: v.sku,
        inventory: v.inventory,
        dailyVelocity,
        daysOfCover: score.daysOfCover,
        status: score.status,
        reason: score.reason,
        previousStatus: v.lastStockStatus,
      };
    });
  }

  // --- Policy ---------------------------------------------------------------

  async getPolicy(ctx: TenantContext, storeId: string) {
    await this.assertStore(ctx, storeId);
    return this.resolvePolicy(storeId);
  }

  async setPolicy(
    ctx: TenantContext,
    input: {
      storeId: string;
      enabled?: boolean;
      greenDays?: number;
      amberDays?: number;
      reorderPoint?: number;
      velocityWindowDays?: number;
      trackInventory?: boolean;
      allowBackorder?: boolean;
    },
  ) {
    await this.assertStore(ctx, input.storeId);
    const data = {
      enabled: input.enabled ?? DEFAULT_POLICY.enabled,
      greenDays: input.greenDays ?? DEFAULT_POLICY.greenDays,
      amberDays: input.amberDays ?? DEFAULT_POLICY.amberDays,
      reorderPoint: input.reorderPoint ?? DEFAULT_POLICY.reorderPoint,
      velocityWindowDays: input.velocityWindowDays ?? DEFAULT_POLICY.velocityWindowDays,
      trackInventory: input.trackInventory ?? DEFAULT_POLICY.trackInventory,
      allowBackorder: input.allowBackorder ?? DEFAULT_POLICY.allowBackorder,
    };
    return this.prisma.stockPolicy.upsert({
      where: { storeId: input.storeId },
      create: { tenantId: ctx.tenantId, storeId: input.storeId, ...data },
      update: data,
    });
  }

  // --- Fulfillment policy + inventory movement ------------------------------

  /** The store's stock-consumption policy (tracking + backorder). */
  async fulfillmentPolicy(storeId: string): Promise<{ trackInventory: boolean; allowBackorder: boolean }> {
    const row = await this.prisma.stockPolicy.findUnique({ where: { storeId }, select: { trackInventory: true, allowBackorder: true } });
    return { trackInventory: row?.trackInventory ?? DEFAULT_POLICY.trackInventory, allowBackorder: row?.allowBackorder ?? DEFAULT_POLICY.allowBackorder };
  }

  /**
   * Overselling guard for checkout: throws when an item exceeds available stock,
   * unless the store doesn't track inventory or allows backorder. `available` is
   * the current inventory the caller already resolved for each variant.
   */
  async assertCanFulfill(storeId: string, items: { variantId: string; title: string; quantity: number; available: number }[]) {
    const p = await this.fulfillmentPolicy(storeId);
    if (!p.trackInventory || p.allowBackorder) return;
    for (const it of items) {
      if (it.quantity > it.available) {
        throw new ValidationError(
          it.available <= 0
            ? `"${it.title}" is out of stock.`
            : `Only ${it.available} of "${it.title}" left in stock (you requested ${it.quantity}).`,
        );
      }
    }
  }

  /** Decrement stock for a paid order's items (idempotency is the caller's job). */
  async applyOrderSale(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { storeId: true, items: { select: { variantId: true, quantity: true } } } });
    if (!order) return;
    const p = await this.fulfillmentPolicy(order.storeId);
    if (!p.trackInventory) return;
    for (const it of order.items) {
      if (!it.variantId) continue;
      if (p.allowBackorder) {
        await this.prisma.productVariant.update({ where: { id: it.variantId }, data: { inventory: { decrement: it.quantity } } });
      } else {
        // Clamp at 0 atomically so a race can't push tracked stock negative.
        await this.prisma.$executeRaw`UPDATE "ProductVariant" SET inventory = GREATEST(inventory - ${it.quantity}, 0) WHERE id = ${it.variantId}`;
      }
    }
  }

  /** Return all of an order's items to stock (full cancellation of a paid order). */
  async restoreOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { storeId: true, items: { select: { variantId: true, quantity: true } } } });
    if (!order) return;
    const p = await this.fulfillmentPolicy(order.storeId);
    if (!p.trackInventory) return;
    for (const it of order.items) {
      if (it.variantId) await this.prisma.productVariant.update({ where: { id: it.variantId }, data: { inventory: { increment: it.quantity } } });
    }
  }

  /** Return the received items of a return to stock (skips non-resaleable / damaged). */
  async restoreReturn(returnId: string) {
    const ret = await this.prisma.return.findUnique({
      where: { id: returnId },
      select: { storeId: true, reason: true, items: { select: { quantity: true, orderItem: { select: { variantId: true } } } } },
    });
    if (!ret) return;
    if (ret.reason === 'DAMAGED') return; // damaged goods aren't resaleable
    const p = await this.fulfillmentPolicy(ret.storeId);
    if (!p.trackInventory) return;
    for (const ri of ret.items) {
      const variantId = ri.orderItem?.variantId;
      if (variantId) await this.prisma.productVariant.update({ where: { id: variantId }, data: { inventory: { increment: ri.quantity } } });
    }
  }

  // --- Recompute + alert (worker job; not tenant-scoped) --------------------

  /**
   * Recompute stock status for every store and alert owners when a variant
   * newly degrades to AMBER (LOW_STOCK) or RED (OUT_OF_STOCK).
   */
  async recomputeAndAlert(): Promise<{ scanned: number; alerts: number }> {
    const stores = await this.prisma.store.findMany({ select: { id: true, tenantId: true } });
    let scanned = 0;
    let alerts = 0;

    for (const store of stores) {
      try {
      const policy = await this.resolvePolicy(store.id);
      if (!policy.enabled) continue;
      const ctx: TenantContext = { tenantId: store.tenantId };
      const statuses = await this.getStockStatus(ctx, store.id);

      for (const s of statuses) {
        scanned++;
        if (s.status === s.previousStatus) continue;

        await this.prisma.productVariant.update({
          where: { id: s.variantId },
          data: { lastStockStatus: s.status },
        });

        // Alert only when newly degraded (entering AMBER/RED).
        const event = s.status === 'RED' ? 'OUT_OF_STOCK' : s.status === 'AMBER' ? 'LOW_STOCK' : null;
        if (event) {
          await this.notifications
            .notify(ctx, {
              storeId: store.id,
              event,
              recipientType: 'STORE_OWNER',
              data: {
                productTitle: `${s.productTitle} (${s.title})`,
                inventory: s.inventory,
                daysOfCover: s.daysOfCover != null ? Math.round(s.daysOfCover) : 'n/a',
              },
            })
            .then((r) => {
              if (r.some((x) => x.status === 'SENT')) alerts++;
            })
            .catch(() => undefined);
        }
      }
      } catch {
        // A store mutated/removed mid-scan shouldn't abort the whole job.
        continue;
      }
    }
    return { scanned, alerts };
  }
}
