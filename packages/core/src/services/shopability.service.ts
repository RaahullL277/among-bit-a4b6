import type { AgentChannel, PrismaClient, Store } from '@prisma/client';
import { ForbiddenError, NotFoundError, ValidationError, type TenantContext } from '../context.js';
import type { StorefrontService } from './storefront.service.js';

/** A delegated-payment mandate an AI buyer-agent presents: authorization to pay
 * up to `maxAmountMinor` in `currency`, identified by `ref` (AP2/ACP-style). */
export interface PaymentMandate {
  ref: string;
  maxAmountMinor: number;
  currency: string;
}

export const AGENT_CHANNELS: AgentChannel[] = ['CLAUDE', 'CHATGPT', 'GEMINI', 'PERPLEXITY', 'COPILOT', 'META_AI'];

// Human-friendly labels + the aliases an incoming agent might identify itself by.
const CHANNEL_META: Record<AgentChannel, { label: string; aliases: string[] }> = {
  CLAUDE: { label: 'Claude', aliases: ['claude', 'anthropic'] },
  CHATGPT: { label: 'ChatGPT', aliases: ['chatgpt', 'openai', 'gpt'] },
  GEMINI: { label: 'Gemini', aliases: ['gemini', 'google', 'bard'] },
  PERPLEXITY: { label: 'Perplexity', aliases: ['perplexity', 'pplx'] },
  COPILOT: { label: 'Copilot', aliases: ['copilot', 'microsoft', 'bing'] },
  META_AI: { label: 'Meta AI', aliases: ['meta', 'metaai', 'meta_ai', 'llama'] },
};

/**
 * "Shopability": whether a store's catalog is exposed to external AI shopping
 * assistants (Claude, ChatGPT, Gemini, …) through the public agent-commerce
 * surface, and which assistants specifically. The store owner — or a partner
 * with delegated MANAGE access — toggles it from the admin, REST, or the MCP
 * connector ("disable ChatGPT shopping on my store"). The toggle is enforced at
 * the public manifest/feed/checkout the agents consume.
 */
export class ShopabilityService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storefront: StorefrontService,
  ) {}

  // --- Owner/partner controls (tenant-scoped) -------------------------------

  private async getStore(ctx: TenantContext, storeId: string): Promise<Store> {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, tenantId: ctx.tenantId } });
    if (!store) throw new NotFoundError('Store', storeId);
    return store;
  }

  /** Current config (resolved; returns defaults when no row exists yet). */
  async get(ctx: TenantContext, storeId: string) {
    await this.getStore(ctx, storeId);
    const row = await this.prisma.shopabilityConfig.findUnique({ where: { storeId } });
    const enabled = row?.enabled ?? true;
    const enabledChannels = row?.enabledChannels ?? [...AGENT_CHANNELS];
    return {
      storeId,
      enabled,
      isDefault: !row,
      agentNote: row?.agentNote ?? null,
      channels: AGENT_CHANNELS.map((c) => ({
        channel: c,
        label: CHANNEL_META[c].label,
        enabled: enabled && enabledChannels.includes(c),
      })),
      updatedAt: row?.updatedAt ?? null,
    };
  }

  /** Update the master switch, the per-assistant set, and/or the agent note. */
  async update(
    ctx: TenantContext,
    storeId: string,
    input: { enabled?: boolean; enabledChannels?: AgentChannel[]; agentNote?: string | null },
  ) {
    await this.getStore(ctx, storeId);
    const channels = input.enabledChannels?.filter((c) => AGENT_CHANNELS.includes(c));
    await this.prisma.shopabilityConfig.upsert({
      where: { storeId },
      create: {
        tenantId: ctx.tenantId,
        storeId,
        enabled: input.enabled ?? true,
        enabledChannels: channels ?? [...AGENT_CHANNELS],
        agentNote: input.agentNote ?? null,
      },
      update: {
        enabled: input.enabled ?? undefined,
        enabledChannels: channels ?? undefined,
        agentNote: input.agentNote === undefined ? undefined : input.agentNote,
      },
    });
    return this.get(ctx, storeId);
  }

  /** Master on/off for all AI-assistant shopping. */
  async setEnabled(ctx: TenantContext, storeId: string, enabled: boolean) {
    return this.update(ctx, storeId, { enabled });
  }

  /** Toggle a single assistant (e.g. turn ChatGPT shopping off). */
  async setChannel(ctx: TenantContext, storeId: string, channel: AgentChannel, enabled: boolean) {
    await this.getStore(ctx, storeId);
    if (!AGENT_CHANNELS.includes(channel)) throw new NotFoundError('AgentChannel', String(channel));
    const row = await this.prisma.shopabilityConfig.findUnique({ where: { storeId } });
    const current = new Set<AgentChannel>(row?.enabledChannels ?? [...AGENT_CHANNELS]);
    if (enabled) current.add(channel);
    else current.delete(channel);
    return this.update(ctx, storeId, { enabledChannels: [...current] });
  }

  // --- Public agent-commerce surface ----------------------------------------

  /** Map an incoming channel identifier (query/header) to a known assistant. */
  resolveChannel(input?: string | null): AgentChannel | null {
    if (!input) return null;
    const s = input.trim().toLowerCase();
    for (const c of AGENT_CHANNELS) {
      if (c.toLowerCase() === s || CHANNEL_META[c].aliases.includes(s)) return c;
    }
    return null;
  }

  private async configForStore(storeId: string): Promise<{ store: Store; enabled: boolean; channels: Set<AgentChannel>; note: string | null }> {
    const store = await this.prisma.store.findFirst({ where: { id: storeId } });
    if (!store) throw new NotFoundError('Store', storeId);
    const row = await this.prisma.shopabilityConfig.findUnique({ where: { storeId } });
    return {
      store,
      enabled: store.status === 'ACTIVE' && (row?.enabled ?? true),
      channels: new Set(row?.enabledChannels ?? [...AGENT_CHANNELS]),
      note: row?.agentNote ?? null,
    };
  }

  /** Is the store shoppable right now for this (optional) assistant? */
  async isShoppable(storeId: string, channelInput?: string | null): Promise<{ ok: boolean; reason?: string; channel: AgentChannel | null }> {
    const { enabled, channels } = await this.configForStore(storeId);
    const channel = this.resolveChannel(channelInput);
    if (!enabled) return { ok: false, reason: 'shopability_disabled', channel };
    if (channel) {
      if (!channels.has(channel)) return { ok: false, reason: `channel_disabled_${channel.toLowerCase()}`, channel };
      return { ok: true, channel };
    }
    // An unidentified agent is allowed only when the store is open to ALL assistants;
    // if the merchant disabled any channel, the agent must identify itself so the
    // per-assistant toggle can be enforced (closes the null-channel bypass).
    if (channels.size < AGENT_CHANNELS.length) return { ok: false, reason: 'channel_required', channel: null };
    return { ok: true, channel: null };
  }

  /** Throws 403 when not shoppable — the enforcement point for agent purchase. */
  async assertShoppable(storeId: string, channelInput?: string | null): Promise<AgentChannel | null> {
    const res = await this.isShoppable(storeId, channelInput);
    if (!res.ok) throw new ForbiddenError(`Store is not shoppable via AI assistants (${res.reason}).`);
    return res.channel;
  }

  private storeBase(store: Store): string {
    return store.domain ? `https://${store.domain}` : `https://${store.slug}.acp.store`;
  }

  /**
   * The agent-commerce manifest an AI assistant fetches to learn whether (and how)
   * it may shop the store — modelled on the emerging well-known agentic-commerce
   * descriptor. Always 200 so agents can read the `shoppable` flag.
   */
  async manifest(storeId: string, channelInput?: string | null) {
    const { store, enabled, channels, note } = await this.configForStore(storeId);
    const gate = await this.isShoppable(storeId, channelInput);
    const channel = gate.channel;
    const shoppable = gate.ok;
    const base = `/agent/${storeId}`;
    return {
      protocol: 'acp-agent-commerce/1',
      store: { id: store.id, name: store.name, currency: store.currency, country: store.country, url: this.storeBase(store) },
      shoppable,
      requestedChannel: channel,
      reason: gate.reason,
      enabledChannels: AGENT_CHANNELS.filter((c) => enabled && channels.has(c)).map((c) => ({ channel: c, label: CHANNEL_META[c].label })),
      agentNote: note,
      capabilities: shoppable ? ['browse', 'cart', 'checkout'] : [],
      endpoints: shoppable
        ? { feed: `${base}/feed`, createCart: `${base}/carts`, checkout: `${base}/checkout` }
        : {},
    };
  }

  /**
   * The product feed an enabled assistant consumes to browse the catalog. Throws
   * 403 (via assertShoppable) when the store/assistant is switched off.
   */
  async feed(storeId: string, channelInput?: string | null) {
    await this.assertShoppable(storeId, channelInput);
    const { store } = await this.configForStore(storeId);
    const products = await this.storefront.listProducts(storeId);
    const base = this.storeBase(store);
    return {
      store: { id: store.id, name: store.name, currency: store.currency },
      updatedAt: new Date().toISOString(),
      count: products.length,
      products: products.map((p: any) => {
        const variants = (p.variants ?? []).map((v: any) => ({
          id: v.id,
          title: v.title,
          priceMinor: v.priceMinor,
          price: v.priceMinor / 100,
          currency: v.currency ?? store.currency,
          availability: (v.inventory ?? 0) > 0 ? 'in_stock' : 'out_of_stock',
          inventory: v.inventory ?? 0,
        }));
        const inStock = variants.some((v: any) => v.availability === 'in_stock');
        const from = variants.reduce((min: number | null, v: any) => (min === null ? v.priceMinor : Math.min(min, v.priceMinor)), null);
        return {
          id: p.id,
          title: p.title,
          description: p.description ?? '',
          url: `${base}/products/${p.id}`,
          availability: inStock ? 'in_stock' : 'out_of_stock',
          priceFromMinor: from,
          priceFrom: from === null ? null : from / 100,
          currency: store.currency,
          variants,
        };
      }),
    };
  }

  /** Gated agent cart creation — delegates to the storefront once shoppable. */
  async createCart(storeId: string, channelInput: string | null, input: any) {
    await this.assertShoppable(storeId, channelInput);
    return this.storefront.createCart(storeId, input ?? {});
  }

  /**
   * Gated agent checkout. Beyond the shopability switch, an agent purchase must
   * carry a **delegated-payment mandate** (the buyer's authorization to pay up to
   * a cap) — without it, or if it doesn't cover the cart, the checkout is rejected
   * and audited. Every attempt is recorded with the assistant channel for
   * attribution.
   */
  async checkout(
    storeId: string,
    channelInput: string | null,
    cartId: string,
    opts: { mandate?: PaymentMandate; email?: string; redeemPoints?: number } = {},
  ) {
    const channel = await this.assertShoppable(storeId, channelInput);
    if (!cartId) throw new ValidationError('cartId is required.');

    const cart = await this.prisma.cart.findFirst({ where: { id: cartId, storeId }, include: { items: true } });
    if (!cart) throw new NotFoundError('Cart', cartId);
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { tenantId: true, currency: true } });
    if (!store) throw new NotFoundError('Store', storeId);
    // Validate the mandate against the FULL quoted total (incl. tax + shipping),
    // not just the item subtotal — so the order can't exceed what the buyer authorized.
    const quote = await this.storefront.checkoutQuote(cartId);
    const quotedTotal = quote.totalMinor;

    const reject = async (reason: string) => {
      await this.prisma.agentCheckout.create({
        data: {
          tenantId: store.tenantId, storeId, cartId, channel: channel ?? undefined,
          mandateRef: opts.mandate?.ref ?? '(none)', maxAmountMinor: opts.mandate?.maxAmountMinor ?? 0,
          amountMinor: quotedTotal, currency: store.currency, status: 'REJECTED', reason,
        },
      });
      throw new ForbiddenError(`Agent checkout rejected: ${reason}.`);
    };

    const m = opts.mandate;
    if (!m || !m.ref || typeof m.maxAmountMinor !== 'number') await reject('missing_payment_mandate');
    else if (m.currency && m.currency !== store.currency) await reject('currency_mismatch');
    else if (m.maxAmountMinor < quotedTotal) await reject('mandate_insufficient');

    const result: any = await this.storefront.checkout(cartId, { email: opts.email, redeemPoints: opts.redeemPoints, shippingAddress: (opts as any).shippingAddress });
    const orderTotal = result?.order?.totalMinor ?? quotedTotal;
    // Attribute the order to the AI assistant (source=agent) for analytics.
    if (result?.order?.id) {
      await this.prisma.order.update({ where: { id: result.order.id }, data: { source: 'agent', agentChannel: channel ?? undefined } });
    }
    const agentCheckout = await this.prisma.agentCheckout.create({
      data: {
        tenantId: store.tenantId, storeId, cartId, orderId: result?.order?.id ?? null, channel: channel ?? undefined,
        mandateRef: m!.ref, maxAmountMinor: m!.maxAmountMinor, amountMinor: orderTotal, currency: store.currency, status: 'AUTHORIZED',
      },
    });
    return { ...result, agentCheckout: { id: agentCheckout.id, channel, mandateRef: m!.ref, amountMinor: orderTotal } };
  }

  /** Recent agent-checkout audit (owner/partner view: who bought via which assistant). */
  async checkoutLog(ctx: TenantContext, storeId: string, limit = 50) {
    await this.getStore(ctx, storeId);
    return this.prisma.agentCheckout.findMany({
      where: { tenantId: ctx.tenantId, storeId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
