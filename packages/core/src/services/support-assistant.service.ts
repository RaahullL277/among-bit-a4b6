import { getAssistant } from '../assistant/registry.js';
import type { AssistantProvider, AssistantReply, ChatMessage, ToolSpec } from '../assistant/types.js';
import type { PlatformService } from './platform.service.js';
import type { PlatformAnalyticsService } from './platform-analytics.service.js';

const SYSTEM = `You are the support assistant inside the platform-operator console of a multi-tenant
e-commerce SaaS for India. You help platform staff understand the business: GMV, merchants (tenants),
stores, orders, top merchants, suspensions, and recent staff activity. Use the read-only tools to
fetch real data before answering — never invent numbers. Be concise. Money is in paise (minor units);
format as INR. You cannot take actions; direct the user to the relevant console page for those.`;

const empty = { type: 'object', properties: {}, additionalProperties: false };

function money(minor: unknown): string {
  const n = typeof minor === 'number' ? minor : 0;
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n / 100);
  } catch {
    return `₹${(n / 100).toFixed(0)}`;
  }
}

/** Support chatbot for platform operators, over read-only platform data. */
export class SupportAssistantService {
  private readonly provider: AssistantProvider;

  constructor(
    private readonly platform: PlatformService,
    private readonly analytics: PlatformAnalyticsService,
    provider: AssistantProvider = getAssistant(),
  ) {
    this.provider = provider;
  }

  get providerName() {
    return this.provider.name;
  }

  async chat(messages: ChatMessage[]) {
    const P = this.platform;
    const A = this.analytics;

    const tools: ToolSpec[] = [
      { name: 'overview', description: '30-day platform KPIs: GMV, paid orders, tenant/store counts.', inputSchema: empty, run: () => A.overview({}) },
      {
        name: 'top_merchants',
        description: 'Top merchants by GMV.',
        inputSchema: { type: 'object', properties: { limit: { type: 'integer' } }, additionalProperties: false },
        run: (i: any) => A.topMerchants({ limit: i?.limit }),
      },
      {
        name: 'list_tenants',
        description: 'List merchants, optionally by search or status (ACTIVE/SUSPENDED).',
        inputSchema: {
          type: 'object',
          properties: { search: { type: 'string' }, status: { type: 'string', enum: ['ACTIVE', 'SUSPENDED'] } },
          additionalProperties: false,
        },
        run: (i: any) => P.listTenants(i ?? {}),
      },
      {
        name: 'recent_audit',
        description: 'Recent platform-staff audit-log entries.',
        inputSchema: { type: 'object', properties: { limit: { type: 'integer' } }, additionalProperties: false },
        run: (i: any) => P.listAudit({ limit: i?.limit }),
      },
    ];

    // Deterministic fallback (keyword routing) when no LLM is configured.
    const stub = async (msgs: ChatMessage[]): Promise<AssistantReply> => {
      const last = [...msgs].reverse().find((m) => m.role === 'user')?.content?.toLowerCase() ?? '';
      const done = (reply: string, toolsUsed: string[]): AssistantReply => ({ reply, toolsUsed, provider: 'stub' });

      if (/suspend/.test(last)) {
        const s = await P.listTenants({ status: 'SUSPENDED' });
        return done(s.length ? `${s.length} suspended merchant(s): ${s.map((t) => t.name).join(', ')}.` : 'No merchants are currently suspended.', ['list_tenants']);
      }
      if (/top|best|biggest|largest merchant/.test(last)) {
        const top = await A.topMerchants({ limit: 5 });
        if (!top.length) return done('No paid sales in the recent window yet.', ['top_merchants']);
        return done('Top merchants by GMV:\n' + top.map((m, i) => `${i + 1}. ${m.name} — ${money(m.gmvMinor)} (${m.orders} orders)`).join('\n'), ['top_merchants']);
      }
      if (/audit|activity|recent|who did|log/.test(last)) {
        const a = await P.listAudit({ limit: 5 });
        if (!a.length) return done('No recent platform-staff activity recorded.', ['recent_audit']);
        return done('Recent platform activity:\n' + a.map((x) => `• ${x.actorEmail} — ${x.action}`).join('\n'), ['recent_audit']);
      }
      if (/gmv|revenue|sales|orders|merchant|tenant|store|how many|overview|summary|stat/.test(last)) {
        const o: any = await A.overview({});
        return done(
          `Over the last 30 days: GMV ${money(o.gmvMinor)} across ${o.paidOrders} paid orders. ` +
            `${o.tenants} merchants (${o.activeTenants} active, ${o.suspendedTenants} suspended), ${o.stores} stores, ${o.newTenants} new this period.`,
          ['overview'],
        );
      }
      return done(
        "I can answer about GMV/revenue, merchant and store counts, top merchants, suspended merchants, and recent staff activity. Try: \"What's GMV this month?\"",
        [],
      );
    };

    return this.provider.run({ system: SYSTEM, messages: messages ?? [], tools, stub });
  }
}
