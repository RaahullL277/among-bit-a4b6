import type {
  NotificationChannel,
  NotificationEvent,
  PrismaClient,
  RecipientType,
  Store,
} from '@prisma/client';
import { NotFoundError, type TenantContext } from '../context.js';
import {
  CHANNEL_PROVIDER,
  getEmailProvider,
  getMessagingProvider,
  getSmsProvider,
} from '../adapters/registry.js';
import { DEFAULT_PREFERENCES, DEFAULT_TEMPLATES, renderTemplate } from '../notifications/defaults.js';
import type { IntegrationService } from './integration.service.js';

const RECIPIENT_TYPES: RecipientType[] = ['CUSTOMER', 'STORE_OWNER'];

export interface NotifyInput {
  storeId: string;
  event: NotificationEvent;
  /** Template variables (orderNumber, customerEmail, customerPhone, etc.). */
  data: Record<string, unknown>;
  /** Restrict to a single recipient type; otherwise all configured ones fire. */
  recipientType?: RecipientType;
}

export interface DispatchResult {
  recipientType: RecipientType;
  channel: NotificationChannel;
  to: string;
  status: 'SENT' | 'FAILED' | 'SKIPPED';
  reason?: string;
  providerRef?: string;
}

/**
 * Multi-channel notifications (email / SMS / WhatsApp) to customers and store
 * owners. Channels are resolved per store from encrypted IntegrationConfig;
 * templates and channel preferences fall back to built-in defaults so the
 * system works with zero seeding.
 */
export class NotificationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly integrations: IntegrationService,
  ) {}

  private async getStore(ctx: TenantContext, storeId: string): Promise<Store> {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, tenantId: ctx.tenantId } });
    if (!store) throw new NotFoundError('Store', storeId);
    return store;
  }

  async notify(ctx: TenantContext, input: NotifyInput): Promise<DispatchResult[]> {
    const store = await this.getStore(ctx, input.storeId);
    const data = { storeName: store.name, ...input.data };
    const prefs = await this.effectivePreferences(ctx, store.id, input.event);

    const recipients = input.recipientType ? [input.recipientType] : RECIPIENT_TYPES;
    const results: DispatchResult[] = [];
    for (const recipientType of recipients) {
      for (const channel of prefs[recipientType] ?? []) {
        results.push(await this.dispatch(ctx, store, input.event, recipientType, channel, data));
      }
    }
    return results;
  }

  /** Convenience used by the order/payment flows. Best-effort at call sites. */
  async notifyOrderEvent(ctx: TenantContext, orderId: string, event: NotificationEvent) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId: ctx.tenantId },
      include: { customer: true },
    });
    if (!order) return [];
    return this.notify(ctx, {
      storeId: order.storeId,
      event,
      data: {
        orderNumber: order.number,
        status: order.status,
        total: formatMinor(order.totalMinor, order.currency),
        customerName: order.customer?.name ?? 'there',
        customerEmail: order.customer?.email ?? undefined,
        customerPhone: order.customer?.phone ?? undefined,
      },
    });
  }

  private async dispatch(
    ctx: TenantContext,
    store: Store,
    event: NotificationEvent,
    recipientType: RecipientType,
    channel: NotificationChannel,
    data: Record<string, unknown>,
  ): Promise<DispatchResult> {
    const to = this.resolveAddress(store, recipientType, channel, data);
    const record = (status: DispatchResult['status'], reason?: string, providerRef?: string) =>
      this.record({ ctx, store, event, channel, recipientType, to: to ?? '', status, reason, providerRef });

    if (!to) return record('SKIPPED', 'no_recipient_address');

    const template = await this.resolveTemplate(store.id, event, channel);
    if (!template) return record('SKIPPED', 'no_template');

    let creds;
    try {
      creds = await this.integrations.getCredentials(ctx, store.id, CHANNEL_PROVIDER[channel]);
    } catch {
      return record('SKIPPED', 'channel_not_configured');
    }

    try {
      const body = renderTemplate(template.body, data);
      const provider = CHANNEL_PROVIDER[channel];
      let providerRef: string;
      if (channel === 'EMAIL') {
        const subject = renderTemplate(template.subject ?? '', data);
        providerRef = (await getEmailProvider(provider, creds).send({ to, subject, body })).messageId;
      } else if (channel === 'SMS') {
        providerRef = (await getSmsProvider(provider, creds).send({ to, body })).messageId;
      } else {
        providerRef = (await getMessagingProvider(provider, creds).sendMessage({ to, body })).messageId;
      }
      return record('SENT', undefined, providerRef);
    } catch (err) {
      return record('FAILED', (err as Error).message);
    }
  }

  private resolveAddress(
    store: Store,
    recipientType: RecipientType,
    channel: NotificationChannel,
    data: Record<string, unknown>,
  ): string | undefined {
    const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
    if (recipientType === 'CUSTOMER') {
      return channel === 'EMAIL' ? str(data.customerEmail) : str(data.customerPhone);
    }
    return channel === 'EMAIL' ? store.ownerEmail ?? undefined : store.ownerPhone ?? undefined;
  }

  private async resolveTemplate(storeId: string, event: NotificationEvent, channel: NotificationChannel) {
    const custom = await this.prisma.notificationTemplate.findUnique({
      where: { storeId_event_channel: { storeId, event, channel } },
    });
    if (custom) return { subject: custom.subject ?? undefined, body: custom.body };
    return DEFAULT_TEMPLATES[event]?.[channel];
  }

  private async record(args: {
    ctx: TenantContext;
    store: Store;
    event: NotificationEvent;
    channel: NotificationChannel;
    recipientType: RecipientType;
    to: string;
    status: DispatchResult['status'];
    reason?: string;
    providerRef?: string;
  }): Promise<DispatchResult> {
    await this.prisma.notification.create({
      data: {
        tenantId: args.ctx.tenantId,
        storeId: args.store.id,
        event: args.event,
        channel: args.channel,
        recipientType: args.recipientType,
        to: args.to,
        status: args.status,
        providerRef: args.providerRef,
        error: args.reason,
      },
    });
    return {
      recipientType: args.recipientType,
      channel: args.channel,
      to: args.to,
      status: args.status,
      reason: args.reason,
      providerRef: args.providerRef,
    };
  }

  // --- Preferences ----------------------------------------------------------

  /** Effective channels per recipient for an event (rows override defaults). */
  private async effectivePreferences(
    ctx: TenantContext,
    storeId: string,
    event: NotificationEvent,
  ): Promise<Partial<Record<RecipientType, NotificationChannel[]>>> {
    const rows = await this.prisma.notificationPreference.findMany({
      where: { tenantId: ctx.tenantId, storeId, event },
    });
    const result: Partial<Record<RecipientType, NotificationChannel[]>> = {};
    for (const recipientType of RECIPIENT_TYPES) {
      const row = rows.find((r) => r.recipientType === recipientType);
      if (row) {
        if (row.enabled) result[recipientType] = row.channels;
      } else {
        const def = DEFAULT_PREFERENCES[event]?.[recipientType];
        if (def) result[recipientType] = def;
      }
    }
    return result;
  }

  /** All (event, recipient) preferences with their effective channels. */
  async listPreferences(ctx: TenantContext, storeId: string) {
    await this.getStore(ctx, storeId);
    const rows = await this.prisma.notificationPreference.findMany({
      where: { tenantId: ctx.tenantId, storeId },
    });
    const events = Object.keys(DEFAULT_PREFERENCES) as NotificationEvent[];
    const out: {
      event: NotificationEvent;
      recipientType: RecipientType;
      channels: NotificationChannel[];
      enabled: boolean;
      isCustom: boolean;
    }[] = [];
    for (const event of events) {
      for (const recipientType of RECIPIENT_TYPES) {
        const row = rows.find((r) => r.event === event && r.recipientType === recipientType);
        const def = DEFAULT_PREFERENCES[event]?.[recipientType];
        if (!row && !def) continue;
        out.push({
          event,
          recipientType,
          channels: row ? row.channels : def ?? [],
          enabled: row ? row.enabled : true,
          isCustom: Boolean(row),
        });
      }
    }
    return out;
  }

  async setPreference(
    ctx: TenantContext,
    input: {
      storeId: string;
      event: NotificationEvent;
      recipientType: RecipientType;
      channels: NotificationChannel[];
      enabled?: boolean;
    },
  ) {
    await this.getStore(ctx, input.storeId);
    return this.prisma.notificationPreference.upsert({
      where: {
        storeId_event_recipientType: {
          storeId: input.storeId,
          event: input.event,
          recipientType: input.recipientType,
        },
      },
      create: {
        tenantId: ctx.tenantId,
        storeId: input.storeId,
        event: input.event,
        recipientType: input.recipientType,
        channels: input.channels,
        enabled: input.enabled ?? true,
      },
      update: { channels: input.channels, enabled: input.enabled ?? true },
    });
  }

  async listNotifications(ctx: TenantContext, storeId: string, limit = 50) {
    await this.getStore(ctx, storeId);
    return this.prisma.notification.findMany({
      where: { tenantId: ctx.tenantId, storeId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}

function formatMinor(minor: number, currency: string): string {
  const amount = (minor ?? 0) / 100;
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
