import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getCommerce, type TenantContext } from '@acp/core';
import { registerTools } from './tools.js';

/** Build an MCP server with all commerce tools registered. */
export function buildServer(getContext: () => Promise<TenantContext>): McpServer {
  const server = new McpServer({ name: 'acp-commerce', version: '0.1.0' });
  registerTools(server, getContext);
  return server;
}

/** Cache the resolved context per raw API key so each key is verified once. */
export function contextResolver(rawKey: string | undefined) {
  let cached: TenantContext | undefined;
  return async (): Promise<TenantContext> => {
    if (!cached) cached = await getCommerce().apiKeys.verify(rawKey);
    return cached;
  };
}
