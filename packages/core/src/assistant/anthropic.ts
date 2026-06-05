import Anthropic from '@anthropic-ai/sdk';
import type { AssistantProvider, AssistantReply, AssistantTools, ChatMessage } from './types.js';

const MODEL = 'claude-opus-4-8';
const MAX_TOOL_ROUNDS = 5;

const SYSTEM = `You are the support assistant inside the platform-operator console of a multi-tenant
e-commerce SaaS (think Shopify/Dukaan for India). You help platform staff (not merchants) understand
the business: GMV, merchants (tenants), stores, orders, top merchants, suspensions, and recent staff
activity. Use the provided read-only tools to fetch real data before answering — never invent numbers.
Be concise and factual. Money values are in paise (minor units); format them as INR. You cannot take
actions (suspending, plan changes); direct the user to the relevant console page for those.`;

// Claude tool schemas mapped 1:1 to AssistantTools methods.
const TOOLS = [
  {
    name: 'overview',
    description: 'Platform KPI overview for the last 30 days: GMV, paid orders, tenant/store counts, new merchants.',
    input_schema: { type: 'object' as const, properties: {}, additionalProperties: false },
  },
  {
    name: 'top_merchants',
    description: 'Top merchants ranked by GMV over the last 30 days.',
    input_schema: {
      type: 'object' as const,
      properties: { limit: { type: 'integer', description: 'How many (default 5)' } },
      additionalProperties: false,
    },
  },
  {
    name: 'list_tenants',
    description: 'List merchants, optionally filtered by name search or status (ACTIVE/SUSPENDED).',
    input_schema: {
      type: 'object' as const,
      properties: {
        search: { type: 'string' },
        status: { type: 'string', enum: ['ACTIVE', 'SUSPENDED'] },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'recent_audit',
    description: 'Recent platform-staff audit-log entries (suspensions, plan changes, etc.).',
    input_schema: {
      type: 'object' as const,
      properties: { limit: { type: 'integer' } },
      additionalProperties: false,
    },
  },
];

/** Claude-backed assistant using tool use over the read-only platform tools. */
export class AnthropicAssistant implements AssistantProvider {
  readonly name = 'claude' as const;
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async chat(messages: ChatMessage[], tools: AssistantTools): Promise<AssistantReply> {
    const convo: Anthropic.MessageParam[] = messages.map((m) => ({ role: m.role, content: m.content }));
    const toolsUsed: string[] = [];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const res = await this.client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        // Adaptive thinking is the recommended mode on Opus 4.8; cast to bypass
        // older SDK typings that only know enabled/disabled.
        thinking: { type: 'adaptive' } as any,
        system: SYSTEM,
        tools: TOOLS,
        messages: convo,
      });

      if (res.stop_reason !== 'tool_use') {
        const reply = res.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('')
          .trim();
        return { reply: reply || 'I could not find an answer to that.', toolsUsed, provider: 'claude' };
      }

      convo.push({ role: 'assistant', content: res.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of res.content) {
        if (block.type !== 'tool_use') continue;
        toolsUsed.push(block.name);
        const data = await this.runTool(block.name, block.input as any, tools).catch((e) => ({
          error: (e as Error).message,
        }));
        results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(data) });
      }
      convo.push({ role: 'user', content: results });
    }

    return { reply: 'Sorry, that took too many steps to answer.', toolsUsed, provider: 'claude' };
  }

  private runTool(name: string, input: any, tools: AssistantTools): Promise<unknown> {
    switch (name) {
      case 'overview':
        return tools.overview();
      case 'top_merchants':
        return tools.topMerchants(input?.limit);
      case 'list_tenants':
        return tools.listTenants(input ?? {});
      case 'recent_audit':
        return tools.recentAudit(input?.limit);
      default:
        return Promise.resolve({ error: `unknown tool: ${name}` });
    }
  }
}
