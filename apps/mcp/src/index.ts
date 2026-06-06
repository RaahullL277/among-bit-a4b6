import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

// Load the repo-root .env regardless of the launcher's cwd (Claude Code may
// start this from the project root). Both src/ and dist/ sit three levels deep.
const moduleDir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(moduleDir, '../../../.env') });
config({ path: resolve(process.cwd(), '.env') });
config();

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildServer, resolveSession } from './server.js';

async function startStdio() {
  // Claude launches this over stdio; the credential (merchant API key `sk_…`,
  // partner token `pts_…`, or nothing for onboarding) comes from the env.
  const cred = process.env.ACP_API_KEY ?? process.env.ACP_CREDENTIAL ?? process.env.ACP_PARTNER_TOKEN;
  const server = buildServer(await resolveSession(cred));
  await server.connect(new StdioServerTransport());
  console.error('🤖 ACP MCP connector ready (stdio)');
}

async function startHttp() {
  const port = Number(process.env.MCP_HTTP_PORT ?? 3333);
  const httpServer = createServer(async (req, res) => {
    if (req.method !== 'POST' || !req.url?.startsWith('/mcp')) {
      res.writeHead(404).end('Not found');
      return;
    }
    // Per-request auth: each call carries its own API key.
    const auth = req.headers['authorization'];
    const rawKey =
      (typeof auth === 'string' ? auth.replace(/^Bearer\s+/i, '') : undefined) ??
      (req.headers['x-api-key'] as string | undefined);

    // Stateless: a fresh server+transport per request keeps tenants isolated.
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = buildServer(await resolveSession(rawKey));
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  });
  httpServer.listen(port, () => {
    console.error(`🤖 ACP MCP server ready (http) on http://localhost:${port}/mcp`);
  });
}

const transport = (process.env.MCP_TRANSPORT ?? 'stdio').toLowerCase();
(transport === 'http' ? startHttp() : startStdio()).catch((err) => {
  console.error('Failed to start MCP server:', err);
  process.exit(1);
});
