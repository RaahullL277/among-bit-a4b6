import type { AssistantProvider, AssistantReply, AssistantTools, ChatMessage } from './types.js';

function money(minor: unknown): string {
  const n = typeof minor === 'number' ? minor : 0;
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n / 100);
  } catch {
    return `₹${(n / 100).toFixed(0)}`;
  }
}

/**
 * Deterministic, network-free assistant. Routes the latest question to a data
 * tool by keyword and formats a concise answer. Used when ANTHROPIC_API_KEY is
 * absent; the Claude provider is the real experience.
 */
export class StubAssistant implements AssistantProvider {
  readonly name = 'stub' as const;

  async chat(messages: ChatMessage[], tools: AssistantTools): Promise<AssistantReply> {
    const last = [...messages].reverse().find((m) => m.role === 'user')?.content?.toLowerCase() ?? '';
    const used: string[] = [];

    if (/suspend/.test(last)) {
      used.push('listTenants');
      const suspended = await tools.listTenants({ status: 'SUSPENDED' });
      const names = suspended.map((t) => t.name).join(', ');
      return this.done(
        suspended.length ? `${suspended.length} suspended merchant(s): ${names}.` : 'No merchants are currently suspended.',
        used,
      );
    }

    if (/top|best|biggest|largest merchant/.test(last)) {
      used.push('topMerchants');
      const top = await tools.topMerchants(5);
      if (!top.length) return this.done('No paid sales in the recent window, so there are no top merchants yet.', used);
      const lines = top.map((m, i) => `${i + 1}. ${m.name} — ${money(m.gmvMinor)} (${m.orders} orders)`);
      return this.done(`Top merchants by GMV:\n${lines.join('\n')}`, used);
    }

    if (/audit|activity|recent|who did|log/.test(last)) {
      used.push('recentAudit');
      const audit = await tools.recentAudit(5);
      if (!audit.length) return this.done('No recent platform-staff activity recorded.', used);
      const lines = audit.map((a) => `• ${a.actorEmail} — ${a.action}${a.targetType ? ` (${a.targetType})` : ''}`);
      return this.done(`Recent platform activity:\n${lines.join('\n')}`, used);
    }

    if (/gmv|revenue|sales|orders|merchant|tenant|store|how many|overview|summary|stat/.test(last)) {
      used.push('overview');
      const o = await tools.overview();
      return this.done(
        `Over the last 30 days: GMV ${money(o.gmvMinor)} across ${o.paidOrders} paid orders. ` +
          `${o.tenants} merchants (${o.activeTenants} active, ${o.suspendedTenants} suspended), ` +
          `${o.stores} stores, ${o.newTenants} new merchants this period.`,
        used,
      );
    }

    return this.done(
      "I can answer questions about the platform's GMV/revenue, merchant and store counts, top merchants, suspended merchants, and recent staff activity. Try: \"What's GMV this month?\" or \"Who are the top merchants?\"",
      used,
    );
  }

  private done(reply: string, toolsUsed: string[]): AssistantReply {
    return { reply, toolsUsed, provider: 'stub' };
  }
}
