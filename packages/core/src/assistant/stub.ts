import type { AssistantProvider, AssistantReply, AssistantRequest } from './types.js';

/**
 * Network-free assistant: delegates to the caller-supplied deterministic stub.
 * Used when ANTHROPIC_API_KEY is absent; the Claude provider is the real one.
 */
export class StubAssistant implements AssistantProvider {
  readonly name = 'stub' as const;

  async run(req: AssistantRequest): Promise<AssistantReply> {
    const result = await req.stub(req.messages);
    return { ...result, provider: 'stub' };
  }
}
