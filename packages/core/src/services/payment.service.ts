import type { PrismaClient, ProviderName } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';
import { getPaymentProvider } from '../adapters/registry.js';
import type { IntegrationService } from './integration.service.js';
import type { NotificationService } from './notification.service.js';
import type { MarketingService } from './marketing.service.js';
import type { LoyaltyService } from './loyalty.service.js';
import type { StockService } from './stock.service.js';
import type { CheckoutSettingsService } from './checkout-settings.service.js';
import type { InvoiceService } from './invoice.service.js';
import type { LegalService } from './legal.service.js';

export interface CheckoutInput {
  storeId: string;
  customerId?: string;
  items: { variantId: string; quantity: number }[];
  /** Override the auto-selected provider (must be configured for the store). */
  provider?: ProviderName;
  /** Bundle/offer saving to subtract from the order total (minor units). */
  discountMinor?: number;
  /** Buyer contact + delivery address captured at checkout. */
  email?: string;
  shippingAddress?: Record<string, unknown>;
  /** The buyer opted in to marketing messages (optional, off by default). */
  marketingOptIn?: boolean;
  /** Buyer IP, recorded on the implicit legal-acceptance consent trail (optional). */
  acceptanceIp?: string;
}

/**
 * Orchestrates checkout (order + payment creation through the active payment
 * adapter) and inbound payment webhooks (signature-verified status updates).
 */
export class PaymentService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly integrations: IntegrationService,
    private readonly notifications?: NotificationService,
    private readonly marketing?: MarketingService,
    private readonly loyalty?: LoyaltyService,
    private readonly stock?: StockService,
    private readonly checkoutSettings?: CheckoutSettingsService,
    private readonly invoices?: InvoiceService,
    private readonly legal?: LegalService,
  ) {}

  async checkout(ctx: TenantContext, input: CheckoutInput) {
    if (!input.items?.length) throw new ValidationError('Checkout requires at least one item.');

    const store = await this.prisma.store.findFirst({
      where: { id: input.storeId, tenantId: ctx.tenantId },
      select: { id: true, currency: true },
    });
    if (!store) throw new NotFoundError('Store', input.storeId);

    // Resolve variants — scoped to the tenant AND the order's store so a
    // multi-store tenant can't check out store B's variants through store A
    // (which would corrupt store-level totals and use the wrong integration).
    const variantIds = input.items.map((i) => i.variantId);
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds }, tenantId: ctx.tenantId, product: { storeId: store.id } },
    });
    const variantById = new Map(variants.map((v) => [v.id, v]));

    // B2B quantity price-breaks: the best tier whose minQuantity ≤ the line qty.
    const tiers = await this.prisma.priceTier.findMany({ where: { variantId: { in: variantIds } }, orderBy: { minQuantity: 'asc' } });
    const tiersByVariant = new Map<string, { minQuantity: number; priceMinor: number }[]>();
    for (const t of tiers) {
      const arr = tiersByVariant.get(t.variantId) ?? [];
      arr.push({ minQuantity: t.minQuantity, priceMinor: t.priceMinor });
      tiersByVariant.set(t.variantId, arr);
    }
    const tierPrice = (variantId: string, qty: number, base: number) => {
      const arr = tiersByVariant.get(variantId);
      if (!arr) return base;
      let price = base;
      for (const t of arr) if (qty >= t.minQuantity) price = t.priceMinor; // sorted asc → last match is best
      return price;
    };

    const lineItems = input.items.map((item) => {
      const variant = variantById.get(item.variantId);
      if (!variant) throw new NotFoundError('ProductVariant', item.variantId);
      if (item.quantity <= 0) throw new ValidationError('Item quantity must be positive.');
      return {
        variantId: variant.id,
        title: variant.title,
        quantity: item.quantity,
        unitPriceMinor: tierPrice(variant.id, item.quantity, variant.priceMinor),
      };
    });

    // Stock-consumption policy for the reservation/overselling guard below.
    const fulfillment = (await this.stock?.fulfillmentPolicy(store.id)) ?? { trackInventory: true, allowBackorder: false };
    const subtotalMinor = lineItems.reduce((sum, li) => sum + li.unitPriceMinor * li.quantity, 0);
    // Clamp any offer discount to the subtotal so the charged total never goes negative.
    const discountMinor = Math.max(0, Math.min(Math.round(input.discountMinor ?? 0), subtotalMinor));
    // Apply the store's tax + shipping to get the final charged total.
    const quote = (await this.checkoutSettings?.quote(store.id, subtotalMinor, discountMinor)) ?? {
      taxMinor: 0,
      shippingMinor: 0,
      totalMinor: subtotalMinor - discountMinor,
    };
    const taxMinor = quote.taxMinor;
    const shippingMinor = quote.shippingMinor;
    const totalMinor = quote.totalMinor;

    const provider = input.provider ?? (await this.integrations.getActivePaymentProvider(ctx, store.id));
    const creds = await this.integrations.getCredentials(ctx, store.id, provider);
    const adapter = getPaymentProvider(provider, creds);

    // Create the order, items, and a pending payment atomically.
    const order = await this.prisma.$transaction(async (tx) => {
      const last = await tx.order.aggregate({
        where: { storeId: store.id },
        _max: { number: true },
      });
      const number = (last._max.number ?? 0) + 1;

      const created = await tx.order.create({
        data: {
          tenantId: ctx.tenantId,
          storeId: store.id,
          number,
          customerId: input.customerId,
          status: 'PENDING',
          subtotalMinor,
          totalMinor,
          discountMinor,
          taxMinor,
          shippingMinor,
          email: input.email,
          shippingAddress: (input.shippingAddress ?? undefined) as object | undefined,
          currency: store.currency,
          items: {
            create: lineItems.map((li) => ({
              tenantId: ctx.tenantId,
              variantId: li.variantId,
              title: li.title,
              quantity: li.quantity,
              unitPriceMinor: li.unitPriceMinor,
            })),
          },
          payment: {
            create: {
              tenantId: ctx.tenantId,
              provider,
              status: 'PENDING',
              amountMinor: totalMinor,
              currency: store.currency,
            },
          },
        },
        include: { items: true, payment: true },
      });

      // Hold stock for the pending order (atomic, race-safe). Throwing here
      // rolls back the whole order — so an oversold checkout never persists.
      if (fulfillment.trackInventory) {
        await this.stock!.reserve(tx, { tenantId: ctx.tenantId, storeId: store.id, orderId: created.id, items: lineItems, allowBackorder: fulfillment.allowBackorder });
      }
      return created;
    });

    const result = await adapter.createOrder({
      orderId: order.id,
      amountMinor: totalMinor,
      currency: store.currency,
    });

    await this.prisma.payment.update({
      where: { orderId: order.id },
      data: { providerRef: result.providerRef },
    });

    // Legal acceptance is implicit: placing the order agrees to the store's
    // published policies. Record the consent trail (versions in force), best-effort.
    await this.legal
      ?.recordAcceptance(store.id, { orderId: order.id, email: input.email, ip: input.acceptanceIp, tenantId: ctx.tenantId })
      .catch(() => undefined);

    // Optional marketing opt-in (off by default): grant consent only when the
    // buyer ticked the box and we have a customer to attach it to.
    if (input.marketingOptIn && order.customerId) {
      await this.prisma.customer
        .update({ where: { id: order.customerId }, data: { marketingConsent: true, marketingConsentAt: new Date(), unsubscribedAt: null } })
        .catch(() => undefined);
    }

    // Best-effort order-placed notification; never block checkout.
    await this.notifications?.notifyOrderEvent(ctx, order.id, 'ORDER_PLACED').catch(() => undefined);

    return {
      order: { ...order, payment: { ...order.payment!, providerRef: result.providerRef } },
      checkout: result.checkout,
    };
  }

  /**
   * Refund a (paid) order through its payment adapter. Supports partial refunds
   * via `amountMinor`; marks the order REFUNDED on a full refund. Returns the
   * provider refund reference. Used by the returns flow.
   */
  async refund(ctx: TenantContext, orderId: string, amountMinor?: number) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId: ctx.tenantId },
      include: { payment: true },
    });
    if (!order) throw new NotFoundError('Order', orderId);
    if (!order.payment) throw new ValidationError('This order has no payment to refund.');
    if (!['CAPTURED', 'PARTIALLY_REFUNDED'].includes(order.payment.status)) {
      throw new ValidationError('Only a captured (paid) order can be refunded.');
    }
    // Cap total refunds at the order value across multiple partial refunds.
    const alreadyRefunded = order.payment.refundedMinor;
    const remaining = order.totalMinor - alreadyRefunded;
    if (remaining <= 0) throw new ValidationError('This order has already been fully refunded.');
    const amount = amountMinor ?? remaining;
    if (amount <= 0 || amount > remaining) {
      throw new ValidationError(`Refund amount must be between 1 and the remaining ${remaining} (already refunded ${alreadyRefunded}).`);
    }

    const creds = await this.integrations.getCredentials(ctx, order.storeId, order.payment.provider);
    const adapter = getPaymentProvider(order.payment.provider, creds);
    const result = await adapter.refund(order.payment.providerRef ?? order.id, amount);

    const newRefunded = alreadyRefunded + amount;
    const fullRefund = newRefunded >= order.totalMinor;
    await this.prisma.payment.update({
      where: { orderId: order.id },
      data: { refundedMinor: newRefunded, status: fullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
    });
    if (fullRefund) {
      await this.prisma.order.update({ where: { id: order.id }, data: { status: 'REFUNDED' } });
    }
    return { refundRef: result.refundRef, amountMinor: amount, full: fullRefund, refundedMinor: newRefunded };
  }

  /**
   * Handle an inbound payment webhook. Not tenant-scoped at the edge: the
   * payment is located by providerRef, which yields the owning tenant/store,
   * and the signature is then verified with that store's credentials.
   */
  async handleWebhook(provider: ProviderName, rawBody: string, signature: string | undefined) {
    let providerRef: string | undefined;
    try {
      providerRef = (JSON.parse(rawBody) as { providerRef?: string }).providerRef;
    } catch {
      providerRef = undefined;
    }

    // Match on (provider, providerRef) — providerRef alone is not unique across
    // providers/stores, so scoping by provider avoids ambiguous/cross-routing.
    const payment = providerRef
      ? await this.prisma.payment.findFirst({ where: { provider, providerRef }, include: { order: true } })
      : null;

    let signatureValid = false;
    let eventType = 'payment.unrouted';

    if (payment) {
      const ctx: TenantContext = { tenantId: payment.tenantId };
      const creds = await this.integrations.getCredentials(ctx, payment.order.storeId, provider);
      const adapter = getPaymentProvider(provider, creds);
      signatureValid = adapter.verifyWebhookSignature(rawBody, signature);
      const event = adapter.parseWebhook(rawBody);
      eventType = event.eventType;

      if (signatureValid && event.status) {
        await this.applyPaymentStatus(ctx, payment.id, payment.orderId, event.status);
      }
    }

    await this.prisma.webhookEvent.create({
      data: {
        tenantId: payment?.tenantId,
        provider,
        eventType,
        signatureValid,
        payload: safeJson(rawBody),
      },
    });

    return { routed: Boolean(payment), signatureValid, eventType };
  }

  private async applyPaymentStatus(
    ctx: TenantContext,
    paymentId: string,
    orderId: string,
    status: 'AUTHORIZED' | 'CAPTURED' | 'FAILED' | 'REFUNDED',
  ) {
    await this.prisma.payment.update({ where: { id: paymentId }, data: { status } });
    const orderStatus =
      status === 'CAPTURED' ? 'PAID' : status === 'REFUNDED' ? 'REFUNDED' : status === 'FAILED' ? 'CANCELLED' : undefined;
    if (!orderStatus) return;

    // Run-once transition: a conditional updateMany flips the status atomically, so
    // only the webhook that actually transitions the order runs the side-effects.
    // Duplicate/concurrent CAPTURED webhooks can't double-consume stock or points.
    const guard: any =
      orderStatus === 'PAID' ? { id: orderId, status: { notIn: ['PAID', 'FULFILLED'] } }
      : orderStatus === 'CANCELLED' ? { id: orderId, status: { notIn: ['PAID', 'FULFILLED', 'CANCELLED'] } }
      : { id: orderId, status: { not: 'REFUNDED' } };
    const res = await this.prisma.order.updateMany({ where: guard, data: { status: orderStatus } });
    if (res.count !== 1) return; // already in this/a terminal state — nothing to do

    if (orderStatus === 'CANCELLED') {
      // Payment failed on an unpaid order → free its held stock.
      await this.stock?.releaseReservations(orderId).catch(() => undefined);
      return;
    }
    if (orderStatus === 'PAID') {
      const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { cartId: true } });
      // The reservation becomes a real sale: release the hold, consume inventory.
      await this.stock?.consumeReservations(orderId).catch(() => undefined);
      await this.stock?.applyOrderSale(orderId).catch(() => undefined);
      // Issue the GST tax invoice for the paid order (idempotent, best-effort).
      await this.invoices?.generateForOrder(ctx, orderId).catch(() => undefined);
      // Attribute a paid order back to its cart (recovered if it was abandoned).
      if (order?.cartId) {
        const cart = await this.prisma.cart.findUnique({ where: { id: order.cartId }, select: { status: true } });
        if (cart && cart.status !== 'CONVERTED' && cart.status !== 'RECOVERED') {
          await this.prisma.cart.update({
            where: { id: order.cartId },
            data: { status: cart.status === 'ABANDONED' ? 'RECOVERED' : 'CONVERTED' },
          });
        }
      }
      // Notify the customer their payment succeeded (best-effort).
      await this.notifications?.notifyOrderEvent(ctx, orderId, 'ORDER_PAID').catch(() => undefined);
      // Track the purchase to marketing platforms (best-effort).
      await this.marketing?.trackOrder(ctx, orderId, 'Placed Order').catch(() => undefined);
      // Award loyalty points for the purchase (best-effort, idempotent).
      await this.loyalty?.earnForOrder(ctx, orderId).catch(() => undefined);
    }
  }
}

function safeJson(raw: string): object {
  try {
    return JSON.parse(raw) as object;
  } catch {
    return { raw };
  }
}
