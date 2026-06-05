import type { Prisma, PrismaClient, ProviderName, ShipmentStatus } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';
import { getShippingProvider } from '../adapters/registry.js';
import type { Address } from '../adapters/shipping.js';
import type { IntegrationService } from './integration.service.js';
import type { NotificationService } from './notification.service.js';

const shipmentInclude = { events: { orderBy: { occurredAt: 'desc' as const } } };

// Shipment statuses that should notify the customer, and the event used.
const STATUS_EVENT: Partial<Record<ShipmentStatus, 'SHIPMENT_CREATED' | 'OUT_FOR_DELIVERY' | 'DELIVERED'>> = {
  MANIFESTED: 'SHIPMENT_CREATED',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
};

export interface CreateShipmentInput {
  orderId: string;
  to: Address;
  from?: Address;
  weightGrams?: number;
  provider?: ProviderName;
}

/**
 * Shipping / logistics. Creates shipments through the store's active shipping
 * provider (Delhivery), tracks status via signed webhooks, and notifies the
 * customer at key milestones using the notification system.
 */
export class ShippingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly integrations: IntegrationService,
    private readonly notifications: NotificationService,
  ) {}

  async createShipment(ctx: TenantContext, input: CreateShipmentInput) {
    const order = await this.prisma.order.findFirst({
      where: { id: input.orderId, tenantId: ctx.tenantId },
      include: { shipment: true, payment: true },
    });
    if (!order) throw new NotFoundError('Order', input.orderId);
    if (order.shipment) throw new ValidationError('This order already has a shipment.');
    if (!input.to || (!input.to.pincode && !input.to.line1)) {
      throw new ValidationError('A delivery address (at least line1/pincode) is required.');
    }

    const provider = input.provider ?? (await this.integrations.getActiveProvider(ctx, order.storeId, 'SHIPPING'));
    const creds = await this.integrations.getCredentials(ctx, order.storeId, provider);
    const adapter = getShippingProvider(provider, creds);

    const result = await adapter.createShipment({
      orderId: order.id,
      to: input.to,
      from: input.from,
      weightGrams: input.weightGrams,
      codAmountMinor: order.payment?.status === 'CAPTURED' ? undefined : order.totalMinor,
    });

    const shipment = await this.prisma.shipment.create({
      data: {
        tenantId: ctx.tenantId,
        storeId: order.storeId,
        orderId: order.id,
        provider,
        status: result.status,
        awb: result.awb,
        courier: result.courier,
        trackingUrl: result.trackingUrl,
        labelUrl: result.labelUrl,
        weightGrams: input.weightGrams,
        toAddress: input.to as unknown as Prisma.InputJsonValue,
        fromAddress: (input.from ?? undefined) as unknown as Prisma.InputJsonValue | undefined,
        events: { create: [{ status: result.status, description: 'Shipment created' }] },
      },
      include: shipmentInclude,
    });

    // Creating a shipment fulfils the order.
    await this.prisma.order.update({ where: { id: order.id }, data: { status: 'FULFILLED' } });
    await this.notifyMilestone(ctx, shipment).catch(() => undefined);
    return shipment;
  }

  async getShipment(ctx: TenantContext, id: string) {
    const shipment = await this.prisma.shipment.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: shipmentInclude,
    });
    if (!shipment) throw new NotFoundError('Shipment', id);
    return shipment;
  }

  async listShipments(ctx: TenantContext, opts: { storeId?: string; status?: ShipmentStatus } = {}) {
    return this.prisma.shipment.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(opts.storeId ? { storeId: opts.storeId } : {}),
        ...(opts.status ? { status: opts.status } : {}),
      },
      include: shipmentInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async cancelShipment(ctx: TenantContext, id: string) {
    const shipment = await this.getShipment(ctx, id);
    if (shipment.awb) {
      const creds = await this.integrations.getCredentials(ctx, shipment.storeId, shipment.provider);
      await getShippingProvider(shipment.provider, creds).cancel(shipment.awb).catch(() => undefined);
    }
    return this.applyStatus(shipment.id, 'CANCELLED', 'Cancelled by merchant');
  }

  /**
   * Inbound tracking webhook. Located by AWB (yielding tenant/store), then the
   * signature is verified with that store's credentials before applying status.
   */
  async handleTrackingWebhook(provider: ProviderName, rawBody: string, signature: string | undefined) {
    let awb: string | undefined;
    try {
      awb = (JSON.parse(rawBody) as { awb?: string }).awb;
    } catch {
      awb = undefined;
    }
    const shipment = awb
      ? await this.prisma.shipment.findFirst({ where: { awb, provider } })
      : null;
    if (!shipment) return { routed: false, signatureValid: false };

    const ctx: TenantContext = { tenantId: shipment.tenantId };
    const creds = await this.integrations.getCredentials(ctx, shipment.storeId, provider);
    const adapter = getShippingProvider(provider, creds);
    const signatureValid = adapter.verifyWebhookSignature(rawBody, signature);
    if (!signatureValid) return { routed: true, signatureValid: false };

    const event = adapter.parseWebhook(rawBody);
    if (event.status) {
      await this.applyStatus(shipment.id, event.status, event.description, event.location);
    }
    return { routed: true, signatureValid: true, status: event.status };
  }

  private async applyStatus(
    shipmentId: string,
    status: ShipmentStatus,
    description?: string,
    location?: string,
  ) {
    const shipment = await this.prisma.shipment.update({
      where: { id: shipmentId },
      data: { status, events: { create: [{ status, description, location }] } },
      include: { ...shipmentInclude, order: true },
    });
    if (status === 'DELIVERED') {
      await this.prisma.order.update({ where: { id: shipment.orderId }, data: { status: 'FULFILLED' } });
    }
    await this.notifyMilestone({ tenantId: shipment.tenantId }, shipment).catch(() => undefined);
    return shipment;
  }

  /** Notify the customer when a shipment hits a customer-facing milestone. */
  private async notifyMilestone(ctx: TenantContext, shipment: { storeId: string; status: ShipmentStatus; orderId: string; awb: string | null; courier: string | null; trackingUrl: string | null }) {
    const event = STATUS_EVENT[shipment.status];
    if (!event) return;
    const order = await this.prisma.order.findUnique({
      where: { id: shipment.orderId },
      include: { customer: true },
    });
    if (!order) return;
    await this.notifications.notify(ctx, {
      storeId: shipment.storeId,
      event,
      recipientType: 'CUSTOMER',
      data: {
        orderNumber: order.number,
        courier: shipment.courier ?? 'courier',
        awb: shipment.awb ?? '',
        trackingUrl: shipment.trackingUrl ?? '',
        customerName: order.customer?.name ?? 'there',
        customerEmail: order.customer?.email ?? undefined,
        customerPhone: order.customer?.phone ?? undefined,
      },
    });
  }
}
