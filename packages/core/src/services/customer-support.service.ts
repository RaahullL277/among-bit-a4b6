import type { PrismaClient, SupportConversationStatus } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';
import { getAssistant } from '../assistant/registry.js';
import type { AssistantReply, ChatMessage, ToolSpec } from '../assistant/types.js';
import type { NotificationService } from './notification.service.js';
import type { CatalogService } from './catalog.service.js';

const DEFAULT_CONFIG = { enabled: true, displayName: 'Assistant', greeting: null as string | null, persona: null as string | null };
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const ORDER_RE = /#?\s*(\d{1,9})\b/;
const MAX_MESSAGE_LEN = 2000; // cap public input to bound LLM/DB cost
const HISTORY_LIMIT = 20;     // last N turns sent to the model

function money(minor: number | undefined, currency = 'INR'): string {
  const n = minor ?? 0;
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(n / 100);
  } catch {
    return `${currency} ${(n / 100).toFixed(2)}`;
  }
}

/**
 * Customer-facing sales & support chatbot for the storefront, plus the merchant
 * inbox/config behind it. The bot answers from real store data (active catalog,
 * order status with contact verification) and can escalate to a human. Uses the
 * shared assistant abstraction (Claude when configured, deterministic stub
 * otherwise) so it works without live LLM access.
 */
export class CustomerSupportService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly notifications?: NotificationService,
    private readonly catalog?: CatalogService,
  ) {}

  private async getStore(ctx: TenantContext, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, tenantId: ctx.tenantId } });
    if (!store) throw new NotFoundError('Store', storeId);
    return store;
  }

  // --- Config (merchant) ----------------------------------------------------

  async getConfig(ctx: TenantContext, storeId: string) {
    await this.getStore(ctx, storeId);
    const row = await this.prisma.supportBotConfig.findUnique({ where: { storeId } });
    // llmActive: true = Claude (real reasoning); false = deterministic keyword stub.
    const llmActive = Boolean(process.env.ANTHROPIC_API_KEY);
    return { ...(row ?? { storeId, ...DEFAULT_CONFIG, isDefault: true }), llmActive };
  }

  async setConfig(
    ctx: TenantContext,
    input: { storeId: string; enabled?: boolean; displayName?: string; greeting?: string; persona?: string },
  ) {
    await this.getStore(ctx, input.storeId);
    const data = {
      enabled: input.enabled ?? true,
      displayName: input.displayName?.trim() || 'Assistant',
      greeting: input.greeting ?? null,
      persona: input.persona ?? null,
    };
    return this.prisma.supportBotConfig.upsert({
      where: { storeId: input.storeId },
      create: { tenantId: ctx.tenantId, storeId: input.storeId, ...data },
      update: data,
    });
  }

  /** Public config a storefront widget needs (no tenant scoping). */
  async publicConfig(storeId: string) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, include: { supportBotConfig: true } });
    if (!store || store.status !== 'ACTIVE') throw new NotFoundError('Store', storeId);
    const cfg = store.supportBotConfig;
    return {
      enabled: cfg?.enabled ?? DEFAULT_CONFIG.enabled,
      displayName: cfg?.displayName ?? DEFAULT_CONFIG.displayName,
      greeting: cfg?.greeting ?? `Hi! I'm the ${store.name} assistant. Ask me about products or your order.`,
    };
  }

  // --- Public chat (storefront) ---------------------------------------------

  async chat(input: { storeId: string; conversationId?: string; message: string; contact?: { name?: string; email?: string } }) {
    const store = await this.prisma.store.findUnique({ where: { id: input.storeId }, include: { supportBotConfig: true } });
    if (!store || store.status !== 'ACTIVE') throw new NotFoundError('Store', input.storeId);
    if (store.supportBotConfig && !store.supportBotConfig.enabled) {
      throw new ValidationError('The assistant is currently unavailable for this store.');
    }
    if (!input.message?.trim()) throw new ValidationError('A message is required.');
    const message = input.message.trim().slice(0, MAX_MESSAGE_LEN); // cap input
    input = { ...input, message };

    const ctx: TenantContext = { tenantId: store.tenantId };
    // UI artifacts the tools surface to the widget: rich product cards + actions.
    const products: any[] = [];
    const actions: any[] = [];
    const pushProduct = (p: any) => { if (p && !products.some((x) => x.id === p.id)) products.push(p); };

    // Load or create the conversation.
    let conversation = input.conversationId
      ? await this.prisma.supportConversation.findFirst({
          where: { id: input.conversationId, storeId: store.id },
          include: { messages: { orderBy: { createdAt: 'asc' } } },
        })
      : null;
    if (!conversation) {
      conversation = await this.prisma.supportConversation.create({
        data: {
          tenantId: store.tenantId,
          storeId: store.id,
          contactName: input.contact?.name,
          contactEmail: input.contact?.email,
        },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      });
    }

    await this.prisma.supportMessage.create({
      data: { tenantId: store.tenantId, conversationId: conversation.id, sender: 'CUSTOMER', body: input.message },
    });

    // Build store-scoped, customer-safe tools.
    let escalated: { reason?: string; email?: string } | null = null;

    const cardFor = (p: any) => ({
      id: p.id,
      title: p.title,
      brand: p.brand ?? undefined,
      priceMinor: p.variants?.[0]?.priceMinor ?? null,
      currency: p.variants?.[0]?.currency ?? store.currency,
      imageUrl: p.images?.[0]?.url ?? null,
    });

    const searchProducts = async (query?: string) => {
      const all = await this.prisma.product.findMany({
        where: { tenantId: ctx.tenantId, storeId: store.id, status: 'ACTIVE' },
        include: { variants: { orderBy: { priceMinor: 'asc' } }, images: { where: { isPrimary: true }, take: 1 } },
        take: 50,
      });
      const q = query?.toLowerCase().trim();
      const matched = q
        ? all.filter((p) => `${p.title} ${p.description ?? ''} ${p.brand ?? ''}`.toLowerCase().includes(q))
        : all;
      const top = (matched.length ? matched : all).slice(0, 6);
      top.forEach((p) => pushProduct(cardFor(p)));
      return top.map((p) => ({ id: p.id, title: p.title, brand: p.brand ?? undefined, description: p.description ?? undefined, price: money(p.variants[0]?.priceMinor, p.variants[0]?.currency) }));
    };

    // Full product detail (variants, options, stock, images, key specs).
    const getProduct = async (args: { productId?: string }) => {
      if (!args.productId) return { error: 'product_id_required' };
      const p = await this.prisma.product.findFirst({
        where: { id: args.productId, storeId: store.id, status: 'ACTIVE' },
        include: { variants: { orderBy: { priceMinor: 'asc' } }, images: { orderBy: [{ isPrimary: 'desc' }, { position: 'asc' }], take: 1 }, attributes: { orderBy: { position: 'asc' }, take: 8 }, options: { include: { values: true } } },
      });
      if (!p) return { error: 'product_not_found' };
      pushProduct(cardFor(p));
      return {
        id: p.id, title: p.title, brand: p.brand ?? undefined, description: p.description ?? undefined,
        warrantyMonths: p.warrantyMonths ?? undefined,
        options: p.options.map((o) => ({ name: o.name, values: o.values.map((v) => v.value) })),
        variants: p.variants.map((v) => ({ id: v.id, title: v.title, price: money(v.priceMinor, v.currency), inStock: (v.inventory - v.reserved) > 0, options: v.options ?? undefined })),
        specs: p.attributes.map((a) => `${a.name}: ${a.value}${a.unit ? ` ${a.unit}` : ''}`),
      };
    };

    // Browse by category / brand / price.
    const browseCatalog = async (args: { collection?: string; brand?: string; maxPriceMinor?: number; minPriceMinor?: number }) => {
      const cards = (await this.catalog?.filter(store.id, { collection: args.collection, brand: args.brand, maxPriceMinor: args.maxPriceMinor, minPriceMinor: args.minPriceMinor, limit: 6 })) ?? [];
      cards.forEach((c: any) => pushProduct(c));
      return cards.map((c: any) => ({ id: c.id, title: c.title, brand: c.brand, price: money(c.priceMinor, c.currency) }));
    };

    // Add a variant to the shopper's cart (executed client-side by the widget).
    const addToCart = async (args: { variantId?: string; quantity?: number }) => {
      if (!args.variantId) return { error: 'variant_id_required' };
      const v = await this.prisma.productVariant.findFirst({
        where: { id: args.variantId, tenantId: ctx.tenantId, product: { storeId: store.id, status: 'ACTIVE' } },
        include: { product: { select: { title: true } } },
      });
      if (!v) return { error: 'variant_not_found' };
      if ((v.inventory - v.reserved) <= 0) return { error: 'out_of_stock' };
      const quantity = Math.max(1, Math.min(99, Math.round(args.quantity ?? 1)));
      actions.push({ type: 'add_to_cart', variantId: v.id, quantity, title: v.product.title, priceMinor: v.priceMinor });
      return { added: true, title: v.product.title, quantity, price: money(v.priceMinor, v.currency) };
    };

    // Store policies (returns, shipping, published legal docs).
    const getPolicies = async () => {
      const [rp, cs, legal] = await Promise.all([
        this.prisma.returnPolicy.findUnique({ where: { storeId: store.id } }),
        this.prisma.checkoutSettings.findUnique({ where: { storeId: store.id } }),
        this.prisma.legalPolicy.findMany({ where: { storeId: store.id, status: 'PUBLISHED' }, select: { type: true, title: true } }),
      ]);
      return {
        returns: rp ? { enabled: rp.enabled, windowDays: rp.returnWindowDays, restockingFeePercent: rp.restockingFeePercent, cancelWindowHours: rp.cancelWindowHours } : { windowDays: 30, enabled: true },
        shipping: cs ? { flatShipping: money(cs.flatShippingMinor, store.currency), freeShippingOver: cs.freeShippingOverMinor ? money(cs.freeShippingOverMinor, store.currency) : null } : null,
        legalDocuments: legal.map((l) => l.title),
      };
    };

    const getOrderStatus = async (args: { orderNumber?: number; email?: string; phone?: string }) => {
      if (!args.orderNumber) return { error: 'order_number_required' };
      const order = await this.prisma.order.findFirst({
        where: { storeId: store.id, number: Number(args.orderNumber) },
        include: { customer: true, payment: true, shipment: true },
      });
      if (!order) return { error: 'order_not_found' };
      const email = (args.email ?? '').toLowerCase();
      const phone = (args.phone ?? '').replace(/\s/g, '');
      const ok =
        (email && order.customer?.email?.toLowerCase() === email) ||
        (phone && order.customer?.phone?.replace(/\s/g, '') === phone);
      if (!ok) return { error: 'verification_failed', hint: 'Provide the email or phone used on the order.' };
      return {
        number: order.number,
        status: order.status,
        total: money(order.totalMinor, order.currency),
        payment: order.payment?.status ?? null,
        shipment: order.shipment
          ? { status: order.shipment.status, awb: order.shipment.awb, trackingUrl: order.shipment.trackingUrl }
          : null,
      };
    };

    const escalate = async (args: { reason?: string; email?: string }) => {
      escalated = { reason: args.reason, email: args.email };
      return { escalated: true };
    };

    const tools: ToolSpec[] = [
      {
        name: 'search_products',
        description: 'Search the active catalog by keyword (or list products if no query). Returns titles, brands and prices. The product cards are shown to the shopper.',
        inputSchema: { type: 'object', properties: { query: { type: 'string' } }, additionalProperties: false },
        run: (i: any) => searchProducts(i?.query),
      },
      {
        name: 'get_product',
        description: 'Get full detail for one product (variants, options, in-stock, key specs, warranty) by its id — use after search to answer questions and recommend a specific variant.',
        inputSchema: { type: 'object', properties: { productId: { type: 'string' } }, required: ['productId'], additionalProperties: false },
        run: (i: any) => getProduct(i ?? {}),
      },
      {
        name: 'browse_catalog',
        description: 'Browse products filtered by category (collection handle), brand, or price range. Returns matching product cards.',
        inputSchema: { type: 'object', properties: { collection: { type: 'string' }, brand: { type: 'string' }, minPriceMinor: { type: 'integer' }, maxPriceMinor: { type: 'integer' } }, additionalProperties: false },
        run: (i: any) => browseCatalog(i ?? {}),
      },
      {
        name: 'add_to_cart',
        description: 'Add a specific variant to the shopper\'s cart so they can check out. Confirm the variant (size/colour) first. quantity defaults to 1.',
        inputSchema: { type: 'object', properties: { variantId: { type: 'string' }, quantity: { type: 'integer' } }, required: ['variantId'], additionalProperties: false },
        run: (i: any) => addToCart(i ?? {}),
      },
      {
        name: 'get_policies',
        description: 'Get the store\'s return/refund window, shipping fees, and the names of its published legal policies. Use for "what\'s your return policy / shipping cost".',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        run: () => getPolicies(),
      },
      {
        name: 'get_order_status',
        description:
          'Look up an order by its number, verifying the customer with the email or phone used. Returns order/payment/shipment status.',
        inputSchema: {
          type: 'object',
          properties: { orderNumber: { type: 'integer' }, email: { type: 'string' }, phone: { type: 'string' } },
          required: ['orderNumber'],
          additionalProperties: false,
        },
        run: (i: any) => getOrderStatus(i ?? {}),
      },
      {
        name: 'escalate_to_human',
        description: 'Flag this conversation for a human agent when you cannot help or the customer asks for a person.',
        inputSchema: {
          type: 'object',
          properties: { reason: { type: 'string' }, email: { type: 'string' } },
          additionalProperties: false,
        },
        run: (i: any) => escalate(i ?? {}),
      },
    ];

    const system =
      `You are a friendly sales & support assistant for the online store "${store.name}" (currency ${store.currency}). ` +
      `Help shoppers discover products, answer questions, and complete a purchase. Use the tools for real data — never invent ` +
      `products, prices, specs, stock, policies, or order details. search_products / browse_catalog to find items, get_product ` +
      `for detail (variants, stock, specs), add_to_cart once the shopper picks a variant (confirm size/colour first), ` +
      `get_policies for returns/shipping, and get_order_status (needs the order number AND the email or phone on it). ` +
      `If you can't help, or the customer wants a human, refund, or complaint handled, use escalate_to_human. Be concise and warm.` +
      (store.supportBotConfig?.persona ? `\n\nAdditional instructions: ${store.supportBotConfig.persona}` : '');

    // Only the last N turns are sent to the model (bounded cost/latency).
    const history: ChatMessage[] = conversation.messages
      .slice(-HISTORY_LIMIT)
      .map((m) => ({ role: m.sender === 'CUSTOMER' ? 'user' : ('assistant' as const), content: m.body }));
    history.push({ role: 'user', content: input.message });

    const stub = async (msgs: ChatMessage[]): Promise<AssistantReply> => {
      const last = [...msgs].reverse().find((m) => m.role === 'user')?.content ?? '';
      const lower = last.toLowerCase();
      const done = (reply: string, toolsUsed: string[]): AssistantReply => ({ reply, toolsUsed, provider: 'stub' });

      if (/human|agent|representative|person|refund|complain|speak|talk to/.test(lower)) {
        await escalate({ reason: last, email: input.contact?.email });
        return done("I've flagged this for a team member — they'll follow up with you soon. Anything else I can help with?", ['escalate_to_human']);
      }
      if (/order|track|status|where.*(order|delivery|package|parcel)|delivered|shipped/.test(lower)) {
        const num = ORDER_RE.exec(last)?.[1];
        const email = EMAIL_RE.exec(last)?.[0] ?? input.contact?.email;
        if (!num || !email) {
          return done('Sure — please share your order number and the email used on the order, and I’ll check the status.', []);
        }
        const r: any = await getOrderStatus({ orderNumber: Number(num), email });
        if (r.error) {
          return done(
            r.error === 'order_not_found'
              ? `I couldn't find order #${num}. Please double-check the number.`
              : "I couldn't verify that order with those details. Please confirm the order number and the email used.",
            ['get_order_status'],
          );
        }
        const ship = r.shipment ? ` Shipment: ${r.shipment.status}${r.shipment.trackingUrl ? ` — track at ${r.shipment.trackingUrl}` : ''}.` : '';
        return done(`Order #${r.number} is ${r.status} (payment ${r.payment ?? 'pending'}), total ${r.total}.${ship}`, ['get_order_status']);
      }
      if (/return|exchange|shipping|delivery (cost|charge|fee)|policy|policies|warranty/.test(lower)) {
        const pol: any = await getPolicies();
        const r = pol.returns;
        const ship = pol.shipping ? ` Shipping: ${pol.shipping.flatShipping}${pol.shipping.freeShippingOver ? ` (free over ${pol.shipping.freeShippingOver})` : ''}.` : '';
        const docs = pol.legalDocuments?.length ? ` See: ${pol.legalDocuments.join(', ')}.` : '';
        return done(`Returns: ${r.enabled ? `accepted within ${r.windowDays} days` : 'not accepted'}.${ship}${docs}`, ['get_policies']);
      }
      if (/\badd to cart\b|\bbuy\b|purchase|i'?ll take|add it|order this/.test(lower)) {
        const matches = await searchProducts(last);
        const first = matches[0];
        if (first) {
          const variant = await this.prisma.productVariant.findFirst({ where: { productId: first.id }, orderBy: { priceMinor: 'asc' } });
          if (variant) {
            const r: any = await addToCart({ variantId: variant.id, quantity: 1 });
            if (r.added) return done(`Added ${r.title} (${r.price}) to your cart. Ready to check out?`, ['search_products', 'add_to_cart']);
          }
        }
        return done('Which item would you like? Tell me the product name and I’ll add it for you.', ['search_products']);
      }
      if (/categor|collection|browse|what do you (sell|have)/.test(lower)) {
        const cards = await browseCatalog({});
        if (!cards.length) return done('Our catalog is being set up — check back soon!', ['browse_catalog']);
        return done(`Here's a selection:\n${cards.map((c: any) => `• ${c.title} — ${c.price}`).join('\n')}`, ['browse_catalog']);
      }
      if (/hi|hello|hey|namaste/.test(lower) && lower.length < 16) {
        return done(store.supportBotConfig?.greeting ?? `Hi! How can I help you shop at ${store.name} today?`, []);
      }
      // Default: treat as a product query.
      const products = await searchProducts(last);
      if (!products.length) return done(`We don't have anything matching that yet. Ask me about our products or your order.`, ['search_products']);
      const lines = products.map((p) => `• ${p.title} — ${p.price}`);
      return done(`Here are some options:\n${lines.join('\n')}\nWant details on any of these?`, ['search_products']);
    };

    const result = await getAssistant().run({ system, messages: history, tools, stub });

    await this.prisma.supportMessage.create({
      data: {
        tenantId: store.tenantId,
        conversationId: conversation.id,
        sender: 'BOT',
        body: result.reply,
        toolsUsed: result.toolsUsed,
      },
    });
    await this.prisma.supportConversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        ...(escalated ? { status: 'ESCALATED', escalationReason: (escalated as any).reason, contactEmail: (escalated as any).email ?? conversation.contactEmail } : {}),
      },
    });

    // Alert the store owner the first time a conversation escalates (best-effort).
    if (escalated && conversation.status !== 'ESCALATED') {
      const reason = (escalated as any).reason as string | undefined;
      await this.notifications
        ?.notify({ tenantId: store.tenantId }, {
          storeId: store.id,
          event: 'SUPPORT_ESCALATED',
          recipientType: 'STORE_OWNER',
          data: {
            reasonSuffix: reason ? ` — "${reason}"` : '',
            contactEmail: (escalated as any).email ?? conversation.contactEmail ?? 'unknown',
            conversationId: conversation.id,
          },
        })
        .catch(() => undefined);
    }

    return {
      conversationId: conversation.id,
      reply: result.reply,
      status: escalated ? 'ESCALATED' : conversation.status,
      // Rich product suggestion cards + client-side actions (e.g. add-to-cart).
      products,
      actions,
      toolsUsed: result.toolsUsed,
    };
  }

  // --- Merchant inbox -------------------------------------------------------

  async listConversations(ctx: TenantContext, opts: { storeId?: string; status?: SupportConversationStatus } = {}) {
    const rows = await this.prisma.supportConversation.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(opts.storeId ? { storeId: opts.storeId } : {}),
        ...(opts.status ? { status: opts.status } : {}),
      },
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
    });
    return rows.map((c) => ({
      id: c.id,
      status: c.status,
      contactName: c.contactName,
      contactEmail: c.contactEmail,
      lastMessageAt: c.lastMessageAt,
      preview: c.messages[0]?.body?.slice(0, 120) ?? '',
    }));
  }

  async getConversation(ctx: TenantContext, id: string) {
    const c = await this.prisma.supportConversation.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!c) throw new NotFoundError('Conversation', id);
    return c;
  }

  /** A human agent replies; re-opens the conversation and notifies the customer. */
  async reply(ctx: TenantContext, id: string, body: string) {
    const c = await this.getConversation(ctx, id);
    if (!body?.trim()) throw new ValidationError('Reply body is required.');
    await this.prisma.supportMessage.create({
      data: { tenantId: ctx.tenantId, conversationId: c.id, sender: 'AGENT', body },
    });
    // Close the handoff loop: email/WhatsApp the customer that a human replied.
    await this.notifications
      ?.notify(ctx, {
        storeId: c.storeId,
        event: 'SUPPORT_AGENT_REPLY',
        recipientType: 'CUSTOMER',
        data: {
          customerName: c.contactName ? ` ${c.contactName}` : '',
          customerEmail: c.contactEmail ?? undefined,
          reply: body.trim().slice(0, 400),
        },
      })
      .catch(() => undefined);
    return this.prisma.supportConversation.update({
      where: { id: c.id },
      data: { status: 'OPEN', lastMessageAt: new Date() },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
  }

  // --- Bot analytics (P2-9) -------------------------------------------------

  /** Deflection/escalation metrics + top tools for a store's support bot. */
  async botAnalytics(ctx: TenantContext, storeId: string) {
    await this.getStore(ctx, storeId);
    const [grouped, msgs] = await Promise.all([
      this.prisma.supportConversation.groupBy({ by: ['status'], where: { tenantId: ctx.tenantId, storeId }, _count: true }),
      this.prisma.supportMessage.findMany({ where: { tenantId: ctx.tenantId, conversation: { storeId }, sender: 'BOT' }, select: { toolsUsed: true }, take: 2000, orderBy: { createdAt: 'desc' } }),
    ]);
    const counts = { OPEN: 0, ESCALATED: 0, RESOLVED: 0 } as Record<string, number>;
    for (const g of grouped) counts[g.status] = g._count;
    const total = counts.OPEN + counts.ESCALATED + counts.RESOLVED;
    const toolFreq: Record<string, number> = {};
    for (const m of msgs) for (const t of m.toolsUsed) toolFreq[t] = (toolFreq[t] ?? 0) + 1;
    const topTools = Object.entries(toolFreq).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, count]) => ({ name, count }));
    return {
      conversations: total,
      open: counts.OPEN,
      escalated: counts.ESCALATED,
      resolved: counts.RESOLVED,
      escalationRate: total ? Math.round((counts.ESCALATED / total) * 100) : 0,
      deflectionRate: total ? Math.round(((total - counts.ESCALATED) / total) * 100) : 0,
      topTools,
    };
  }

  async setStatus(ctx: TenantContext, id: string, status: SupportConversationStatus) {
    await this.getConversation(ctx, id);
    return this.prisma.supportConversation.update({ where: { id }, data: { status } });
  }
}
