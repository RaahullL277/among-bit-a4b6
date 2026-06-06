import type { PrismaClient, ProviderName } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';
import { getPaymentProvider } from '../adapters/registry.js';
import type { IntegrationService } from './integration.service.js';
import type { NotificationService } from './notification.service.js';
import type { MarketingService } from './marketing.service.js';
import type { LoyaltyService } from './loyalty.service.js';

export interface CheckoutInput {
  storeId: string;
  customerId?: string;
  items: { variantId: string; quantity: number }[];
  /** Override the auto-selected provider (must be configured for the store). */
  provider?: ProviderName;
  /** Bundle/offer saving to subtract from the order total (minor units). */
  discountMinor?: number;
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
  ) {}

  async checkout(ctx: TenantContext, input: CheckoutInput) {
    if (!input.items?.length) throw new ValidationError('Checkout requires at least one item.');

    const store = await this.prisma.store.findFirst({
      where: { id: input.storeId, tenantId: ctx.tenantId },
      select: { id: true, currency: true },
    });
    if (!store) throw new NotFoundError('Store', input.storeId);

    // Resolve variants (tenant-scoped) and compute the order total.
    const variantIds = input.items.map((i) => i.variantId);
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds }, tenantId: ctx.tenantId },
    });
    const variantById = new Map(variants.map((v) => [v.id, v]));

    const lineItems = input.items.map((item) => {
      const variant = variantById.get(item.variantId);
      if (!variant) throw new NotFoundError('ProductVariant', item.variantId);
      if (item.quantity <= 0) throw new ValidationError('Item quantity must be positive.');
      return {
        variantId: variant.id,
        title: variant.title,
        quantity: item.quantity,
        unitPriceMinor: variant.priceMinor,
      };
    });
    const subtotalMinor = lineItems.reduce((sum, li) => sum + li.unitPriceMinor * li.quantity, 0);
    // Clamp any offer discount to the subtotal so the charged total never goes negative.
    const discountMinor = Math.max(0, Math.min(Math.round(input.discountMinor ?? 0), subtotalMinor));
    const totalMinor = subtotalMinor - discountMinor;

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

      return tx.order.create({
        data: {
          tenantId: ctx.tenantId,
          storeId: store.id,
          number,
          customerId: input.customerId,
          status: 'PENDING',
          totalMinor,
          discountMinor,
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
    if (order.payment.status !== 'CAPTURED') {
      throw new ValidationError('Only a captured (paid) order can be refunded.');
    }
    const amount = amountMinor ?? order.totalMinor;
    if (amount <= 0 || amount > order.totalMinor) {
      throw new ValidationError('Refund amount must be between 1 and the order total.');
    }

    const creds = await this.integrations.getCredentials(ctx, order.storeId, order.payment.provider);
    const adapter = getPaymentProvider(order.payment.provider, creds);
    const result = await adapter.refund(order.payment.providerRef ?? order.id, amount);

    const fullRefund = amount >= order.totalMinor;
    await this.prisma.payment.update({
      where: { orderId: order.id },
      data: { status: fullRefund ? 'REFUNDED' : order.payment.status },
    });
    if (fullRefund) {
      await this.prisma.order.update({ where: { id: order.id }, data: { status: 'REFUNDED' } });
    }
    return { refundRef: result.refundRef, amountMinor: amount, full: fullRefund };
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

    const payment = providerRef
      ? await this.prisma.payment.findFirst({ where: { providerRef }, include: { order: true } })
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
    if (orderStatus) {
      const order = await this.prisma.order.update({
        where: { id: orderId },
        data: { status: orderStatus },
      });
      if (orderStatus === 'PAID') {
        // Attribute a paid order back to its cart (recovered if it was abandoned).
        if (order.cartId) {
          const cart = await this.prisma.cart.findUnique({
            where: { id: order.cartId },
            select: { status: true },
          });
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
}

function safeJson(raw: string): object {
  try {
    return JSON.parse(raw) as object;
  } catch {
    return { raw };
  }
}
