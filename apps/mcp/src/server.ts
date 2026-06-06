import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getCommerce, type PartnerContext, type TenantContext } from '@acp/core';
import { registerTools } from './tools.js';

/**
 * A connector session, derived once from the configured credential:
 *  - `merchant`  — an API key (`sk_…`): tools operate on that tenant's store.
 *  - `partner`   — a partner token (`pts_…`): partner tools + the ability to
 *                  build/manage a chosen client's store via delegated access.
 *  - `anonymous` — no/invalid credential: onboarding only (create an account,
 *                  then keep building in the same session).
 */
export class Session {
  kind: 'merchant' | 'partner' | 'anonymous';
  partner?: PartnerContext;
  /** Set by create_account so an anonymous session can keep building in place. */
  private adopted?: TenantContext;
  /** The client a partner is currently building/managing. */
  private activeClient?: string;
  private readonly merchantCtx?: TenantContext;

  constructor(init: { kind: 'merchant'; ctx: TenantContext } | { kind: 'partner'; partner: PartnerContext } | { kind: 'anonymous' }) {
    this.kind = init.kind;
    if (init.kind === 'merchant') this.merchantCtx = init.ctx;
    if (init.kind === 'partner') this.partner = init.partner;
  }

  adopt(ctx: TenantContext) {
    this.adopted = ctx;
  }

  setActiveClient(tenantId: string) {
    this.activeClient = tenantId;
  }

  /** The tenant context the store-building tools should act on. */
  async tenantContext(): Promise<TenantContext> {
    if (this.merchantCtx) return this.merchantCtx;
    if (this.partner) {
      const commerce = getCommerce();
      if (!this.activeClient) {
        const clients = await commerce.partners.clients(this.partner.partnerId);
        if (clients.length === 1) this.activeClient = clients[0].tenantId;
        else throw new Error('Choose which client to work on: call list_clients, then use_client(tenantId).');
      }
      return commerce.partners.resolveDelegatedContext(this.partner.partnerId, this.activeClient);
    }
    if (this.adopted) return this.adopted;
    throw new Error(
      'No workspace yet. Call create_account to start a new store, or set your API key (sk_…) or partner token (pts_…) as the connector credential.',
    );
  }
}

/** Resolve the configured credential into a session (never throws — bad/missing → onboarding). */
export async function resolveSession(rawCredential: string | undefined): Promise<Session> {
  const cred = rawCredential?.trim();
  const commerce = getCommerce();
  try {
    if (cred?.startsWith('pts_')) {
      const partner = await commerce.partnerAuth.resolveSession(cred);
      return new Session({ kind: 'partner', partner });
    }
    if (cred?.startsWith('sk_')) {
      const ctx = await commerce.apiKeys.verify(cred);
      return new Session({ kind: 'merchant', ctx });
    }
  } catch {
    // Fall through to onboarding so a fresh user can still create_account.
  }
  return new Session({ kind: 'anonymous' });
}

/** Build an MCP server whose tool set matches the session kind. */
export function buildServer(session: Session): McpServer {
  const server = new McpServer({ name: 'acp-commerce', version: '0.2.0' });
  registerTools(server, session);
  return server;
}

/** Back-compat helper: a merchant session from a raw API key (used in tests). */
export function contextResolver(rawKey: string | undefined) {
  return resolveSession(rawKey);
}
