import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '@acp/core';
import { buildServer, contextResolver } from '../src/server.js';

/**
 * Connects an in-memory MCP client to the server and drives a couple of tools,
 * proving the agentic surface works against the same core service layer.
 * Skips without DATABASE_URL so it doesn't require Postgres in pure-unit runs.
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('mcp tools', () => {
  const prisma = new PrismaClient();
  let tenantId: string;
  let rawKey: string;

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const commerce = new Commerce(prisma);
    const tenant = await prisma.tenant.create({ data: { name: 'MCP Test' } });
    tenantId = tenant.id;
    const key = await commerce.apiKeys.create({ tenantId }, { name: 'mcp-test' });
    rawKey = key.raw;
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('creates and lists a store through MCP tools', async () => {
    const server = buildServer(contextResolver(rawKey));
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverT), client.connect(clientT)]);

    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name)).toContain('create_store');

    const created = await client.callTool({
      name: 'create_store',
      arguments: { name: 'MCP Mart', slug: 'mcp-mart' },
    });
    const store = JSON.parse((created.content as any)[0].text);
    expect(store.name).toBe('MCP Mart');

    const listed = await client.callTool({ name: 'list_stores', arguments: {} });
    const stores = JSON.parse((listed.content as any)[0].text);
    expect(stores.map((s: any) => s.id)).toContain(store.id);

    await client.close();
    await server.close();
  });
});
