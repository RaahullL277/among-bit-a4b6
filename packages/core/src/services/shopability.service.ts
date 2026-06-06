import type { AgentChannel, PrismaClient, Store } from '@prisma/client';
import { ForbiddenError, NotFoundError, type TenantContext } from '../context.js';
import type { StorefrontService } from './storefront.service.js';

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
    if (channel && !channels.has(channel)) return { ok: false, reason: `channel_disabled_${channel.toLowerCase()}`, channel };
    return { ok: true, channel };
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
    const channel = this.resolveChannel(channelInput);
    const shoppable = enabled && (!channel || channels.has(channel));
    const base = `/agent/${storeId}`;
    return {
      protocol: 'acp-agent-commerce/1',
      store: { id: store.id, name: store.name, currency: store.currency, country: store.country, url: this.storeBase(store) },
      shoppable,
      requestedChannel: channel,
      reason: shoppable ? undefined : !enabled ? 'shopability_disabled' : `channel_disabled_${channel?.toLowerCase()}`,
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

  /** Gated agent checkout — delegates to the storefront once shoppable. */
  async checkout(storeId: string, channelInput: string | null, cartId: string, opts: any) {
    await this.assertShoppable(storeId, channelInput);
    return this.storefront.checkout(cartId, opts ?? {});
  }
}
