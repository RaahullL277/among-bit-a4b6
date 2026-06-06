import type { PrismaClient, SupportConversationStatus } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';
import { getAssistant } from '../assistant/registry.js';
import type { AssistantReply, ChatMessage, ToolSpec } from '../assistant/types.js';
import type { NotificationService } from './notification.service.js';

const DEFAULT_CONFIG = { enabled: true, displayName: 'Assistant', greeting: null as string | null, persona: null as string | null };
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const ORDER_RE = /#?\s*(\d{1,9})\b/;

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
    return row ?? { storeId, ...DEFAULT_CONFIG, isDefault: true };
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

    const ctx: TenantContext = { tenantId: store.tenantId };

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

    const searchProducts = async (query?: string) => {
      const products = await this.prisma.product.findMany({
        where: { tenantId: ctx.tenantId, storeId: store.id, status: 'ACTIVE' },
        include: { variants: true },
        take: 50,
      });
      const q = query?.toLowerCase().trim();
      const matched = q
        ? products.filter((p) => `${p.title} ${p.description ?? ''}`.toLowerCase().includes(q))
        : products;
      return (matched.length ? matched : products).slice(0, 5).map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description ?? undefined,
        price: money(p.variants[0]?.priceMinor, p.variants[0]?.currency),
      }));
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
        description: 'Search the active catalog by keyword (or list products if no query). Returns titles and prices.',
        inputSchema: { type: 'object', properties: { query: { type: 'string' } }, additionalProperties: false },
        run: (i: any) => searchProducts(i?.query),
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
      `Help shoppers find products and check their order status. Use the tools to get real data — never invent products, ` +
      `prices, or order details. To check an order you need the order number AND the email or phone used on it; ask for ` +
      `whatever is missing. If you cannot help, or the customer wants a human, refund, or complaint handled, use ` +
      `escalate_to_human. Be concise and warm.` +
      (store.supportBotConfig?.persona ? `\n\nAdditional instructions: ${store.supportBotConfig.persona}` : '');

    const history: ChatMessage[] = conversation.messages.map((m) => ({
      role: m.sender === 'CUSTOMER' ? 'user' : 'assistant',
      content: m.body,
    }));
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
      provider: result.provider,
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

  /** A human agent replies; re-opens the conversation. */
  async reply(ctx: TenantContext, id: string, body: string) {
    const c = await this.getConversation(ctx, id);
    if (!body?.trim()) throw new ValidationError('Reply body is required.');
    await this.prisma.supportMessage.create({
      data: { tenantId: ctx.tenantId, conversationId: c.id, sender: 'AGENT', body },
    });
    return this.prisma.supportConversation.update({
      where: { id: c.id },
      data: { status: 'OPEN', lastMessageAt: new Date() },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async setStatus(ctx: TenantContext, id: string, status: SupportConversationStatus) {
    await this.getConversation(ctx, id);
    return this.prisma.supportConversation.update({ where: { id }, data: { status } });
  }
}
