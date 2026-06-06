/**
 * Generic assistant abstraction reused by multiple bots (platform support,
 * customer support). A caller supplies a system prompt, the conversation, a set
 * of executable tools, and a deterministic stub fallback. Two providers exist:
 * Claude (tool use) and a stub used when no ANTHROPIC_API_KEY is configured.
 */

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantReply {
  reply: string;
  /** Names of any tools consulted, for UI transparency. */
  toolsUsed: string[];
  provider: 'claude' | 'stub';
}

/** A tool the assistant may call. `inputSchema` is a full JSON Schema object. */
export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(input: any): Promise<unknown>;
}

export interface AssistantRequest {
  system: string;
  messages: ChatMessage[];
  tools: ToolSpec[];
  /** Deterministic answer when no LLM is available (keyword routing, etc.). */
  stub: (messages: ChatMessage[]) => Promise<AssistantReply>;
}

export interface AssistantProvider {
  readonly name: 'claude' | 'stub';
  run(req: AssistantRequest): Promise<AssistantReply>;
}
