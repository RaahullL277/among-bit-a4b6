import Anthropic from '@anthropic-ai/sdk';
import type { AssistantProvider, AssistantReply, AssistantRequest } from './types.js';

const MODEL = 'claude-opus-4-8';
const MAX_TOOL_ROUNDS = 6;

/** Claude-backed assistant: runs a tool-use loop over the request's tools. */
export class AnthropicAssistant implements AssistantProvider {
  readonly name = 'claude' as const;
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async run(req: AssistantRequest): Promise<AssistantReply> {
    const convo: Anthropic.MessageParam[] = req.messages.map((m) => ({ role: m.role, content: m.content }));
    const claudeTools: Anthropic.Tool[] = req.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as any,
    }));
    const byName = new Map(req.tools.map((t) => [t.name, t]));
    const toolsUsed: string[] = [];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const res = await this.client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        // Adaptive thinking is the recommended mode on Opus 4.8; cast to bypass
        // older SDK typings that only know enabled/disabled.
        thinking: { type: 'adaptive' } as any,
        system: req.system,
        tools: claudeTools,
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
        const data = await byName
          .get(block.name)
          ?.run(block.input as any)
          .catch((e: Error) => ({ error: e.message }));
        results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(data ?? null) });
      }
      convo.push({ role: 'user', content: results });
    }

    return { reply: 'Sorry, that took too many steps to answer.', toolsUsed, provider: 'claude' };
  }
}
