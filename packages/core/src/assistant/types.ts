/**
 * Support-chatbot abstraction for the platform operator console. The assistant
 * answers operator questions over read-only platform data. Two providers exist:
 * a Claude-backed one (tool use) and a deterministic stub used when no API key
 * is configured — so the feature works without live LLM access.
 */

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Read-only data accessors the assistant may call to answer questions. */
export interface AssistantTools {
  /** Platform KPI overview (GMV, tenants, stores, orders) over a window. */
  overview(): Promise<Record<string, unknown>>;
  /** Top merchants by GMV. */
  topMerchants(limit?: number): Promise<Array<Record<string, unknown>>>;
  /** Tenants, optionally filtered by search/status. */
  listTenants(opts?: { search?: string; status?: 'ACTIVE' | 'SUSPENDED' }): Promise<Array<Record<string, unknown>>>;
  /** Recent platform audit-log entries. */
  recentAudit(limit?: number): Promise<Array<Record<string, unknown>>>;
}

export interface AssistantReply {
  reply: string;
  /** Names of any data tools consulted (for transparency in the UI). */
  toolsUsed: string[];
  /** Which provider answered. */
  provider: 'claude' | 'stub';
}

export interface AssistantProvider {
  readonly name: 'claude' | 'stub';
  chat(messages: ChatMessage[], tools: AssistantTools): Promise<AssistantReply>;
}
