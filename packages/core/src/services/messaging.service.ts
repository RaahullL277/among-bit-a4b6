import type { PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';
import { getMessagingProvider } from '../adapters/registry.js';
import type { IntegrationService } from './integration.service.js';

/**
 * WhatsApp sales & support automation. Milestone 1 wires the send path and a
 * thin automation layer (order notifications, inbound auto-reply hook) over the
 * stub adapter; real Cloud API delivery slots in behind the same interface.
 */
export class MessagingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly integrations: IntegrationService,
  ) {}

  private async adapterFor(ctx: TenantContext, storeId: string) {
    const creds = await this.integrations.getCredentials(ctx, storeId, 'WHATSAPP');
    return getMessagingProvider('WHATSAPP', creds);
  }

  async send(ctx: TenantContext, input: { storeId: string; to: string; body: string }) {
    if (!input.to || !input.body) throw new ValidationError('Both "to" and "body" are required.');
    const adapter = await this.adapterFor(ctx, input.storeId);
    return adapter.sendMessage({ to: input.to, body: input.body });
  }

  async sendTemplate(
    ctx: TenantContext,
    input: { storeId: string; to: string; template: string; variables?: Record<string, string> },
  ) {
    const adapter = await this.adapterFor(ctx, input.storeId);
    return adapter.sendTemplate({ to: input.to, template: input.template, variables: input.variables });
  }

  /**
   * Automation: notify the order's customer of a status change over WhatsApp.
   * No-ops gracefully if the customer has no phone on file.
   */
  async notifyOrderUpdate(ctx: TenantContext, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId: ctx.tenantId },
      include: { customer: true },
    });
    if (!order) throw new NotFoundError('Order', orderId);
    if (!order.customer?.phone) return { skipped: true as const, reason: 'no_customer_phone' };

    const adapter = await this.adapterFor(ctx, order.storeId);
    const result = await adapter.sendTemplate({
      to: order.customer.phone,
      template: 'order_status_update',
      variables: { order_number: String(order.number), status: order.status },
    });
    return { skipped: false as const, result };
  }

  /**
   * Automation hook for inbound customer replies (support). Parses the message
   * and returns a suggested auto-reply; a future LLM/agent step plugs in here.
   */
  async handleInbound(ctx: TenantContext, storeId: string, rawBody: string) {
    const adapter = await this.adapterFor(ctx, storeId);
    const message = adapter.parseInbound(rawBody);
    const autoReply = `Thanks for reaching out! A team member will reply shortly. (echo: "${message.body}")`;
    await adapter.sendMessage({ to: message.from, body: autoReply });
    return { message, autoReply };
  }
}
