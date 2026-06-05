import type { PrismaClient, ProviderName } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';
import { getPaymentProvider } from '../adapters/registry.js';
import type { IntegrationService } from './integration.service.js';
import type { NotificationService } from './notification.service.js';

export interface CheckoutInput {
  storeId: string;
  customerId?: string;
  items: { variantId: string; quantity: number }[];
  /** Override the auto-selected provider (must be configured for the store). */
  provider?: ProviderName;
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
    const totalMinor = lineItems.reduce((sum, li) => sum + li.unitPriceMinor * li.quantity, 0);

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
      await this.prisma.order.update({ where: { id: orderId }, data: { status: orderStatus } });
      // Notify the customer their payment succeeded (best-effort).
      if (orderStatus === 'PAID') {
        await this.notifications?.notifyOrderEvent(ctx, orderId, 'ORDER_PAID').catch(() => undefined);
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
