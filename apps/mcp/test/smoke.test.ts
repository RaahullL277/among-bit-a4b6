import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '@acp/core';
import { buildServer, resolveSession } from '../src/server.js';

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

  // Connect an in-memory client to a fresh server authenticated as our tenant.
  async function connect() {
    const server = buildServer(await resolveSession(rawKey));
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverT), client.connect(clientT)]);
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const res = await client.callTool({ name, arguments: args });
      if (res.isError) throw new Error((res.content as any)[0].text);
      return JSON.parse((res.content as any)[0].text);
    };
    const close = async () => {
      await client.close();
      await server.close();
    };
    return { client, call, close };
  }

  // Connect with an arbitrary credential (or none) to exercise other sessions.
  async function connectWith(cred: string | undefined) {
    const server = buildServer(await resolveSession(cred));
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverT), client.connect(clientT)]);
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const res = await client.callTool({ name, arguments: args });
      if (res.isError) throw new Error((res.content as any)[0].text);
      return JSON.parse((res.content as any)[0].text);
    };
    return { client, call, close: async () => { await client.close(); await server.close(); } };
  }

  it('onboards a brand-new user (no credential) and launches a store in one session', async () => {
    const { client, call, close } = await connectWith(undefined);
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toContain('create_account');
    expect(names).toContain('launch_store');

    const email = `founder+${randomBytes(4).toString('hex')}@example.com`;
    const account = await call('create_account', { businessName: 'Spice Route', ownerEmail: email });
    expect(account.apiKey).toMatch(/^sk_/);

    // Same session can keep building (it adopted the new workspace).
    const launched = await call('launch_store', {
      name: 'Spice Route',
      tagline: 'Fresh spices, fast',
      products: [{ title: 'Turmeric 200g', priceMinor: 18000, inventory: 40 }],
    });
    expect(launched.published).toBe(true);
    expect(launched.storefrontUrl).toContain(`?store=${launched.storeId}`);
    expect(launched.products).toHaveLength(1);

    // Clean up the workspace the account created.
    await prisma.tenant.delete({ where: { id: account.tenantId } }).catch(() => undefined);
    await close();
  });

  it('exposes partner tools and builds for a client via delegated access', async () => {
    const commerce = new Commerce(prisma);
    // A partner with one managed client (default MANAGE access).
    const partner = await commerce.partners.createPartner({ name: 'Agency', email: `agency+${randomBytes(4).toString('hex')}@example.com` });
    const clientTenant = await prisma.tenant.create({ data: { name: 'Client Co' } });
    await commerce.partners.addClient(partner.id, { tenantId: clientTenant.id });
    const { token } = await commerce.partnerAuth.requestMagicLink((await prisma.partner.findUnique({ where: { id: partner.id } }))!.email);
    const session = await commerce.partnerAuth.verifyMagicLink(token!);

    const { client, call, close } = await connectWith(session.token);
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toContain('list_clients');
    expect(names).toContain('use_client');

    const clients = await call('list_clients');
    expect(clients[0].tenantId).toBe(clientTenant.id);
    await call('use_client', { tenantId: clientTenant.id });
    // The partner can now build on the client's store.
    const store = await call('create_store', { name: 'Client Store' });
    expect(store.tenantId).toBe(clientTenant.id);

    await prisma.tenant.delete({ where: { id: clientTenant.id } }).catch(() => undefined);
    await prisma.partner.delete({ where: { id: partner.id } }).catch(() => undefined);
    await close();
  });

  it('creates and lists a store through MCP tools', async () => {
    const { client, call, close } = await connect();

    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name)).toContain('create_store');

    const store = await call('create_store', { name: 'MCP Mart', slug: 'mcp-mart' });
    expect(store.name).toBe('MCP Mart');

    const stores = await call('list_stores');
    expect(stores.map((s: any) => s.id)).toContain(store.id);

    await close();
  });

  it('drives a full agentic flow: store -> product -> payment config -> checkout -> order', async () => {
    const { call, close } = await connect();

    // 1. An agent provisions a store and a product.
    const store = await call('create_store', { name: 'Agent Bazaar', slug: 'agent-bazaar' });
    const product = await call('create_product', {
      storeId: store.id,
      title: 'Cardamom (100g)',
      status: 'ACTIVE',
      variants: [{ sku: 'CARD-100', priceMinor: 18000, inventory: 25 }],
    });
    const variantId = product.variants[0].id;

    // 2. Configure a payment provider (credentials encrypted at rest).
    await call('configure_payment_provider', {
      storeId: store.id,
      provider: 'RAZORPAY',
      credentials: { keyId: 'rzp_test_x', webhookSecret: 'whsec' },
    });

    // 3. Check out 2 units -> a PENDING order with a provider reference.
    const checkout = await call('checkout', {
      storeId: store.id,
      items: [{ variantId, quantity: 2 }],
    });
    expect(checkout.order.status).toBe('PENDING');
    expect(checkout.order.totalMinor).toBe(36000);
    expect(checkout.order.payment.providerRef).toMatch(/^razorpay_/);

    // 4. The order is visible through the agentic surface.
    const orders = await call('list_orders', { storeId: store.id });
    expect(orders.map((o: any) => o.id)).toContain(checkout.order.id);

    const fetched = await call('get_order', { orderId: checkout.order.id });
    expect(fetched.items[0].quantity).toBe(2);

    // 5. Advance fulfillment status through the agent.
    const updated = await call('update_order_status', {
      orderId: checkout.order.id,
      status: 'FULFILLED',
    });
    expect(updated.status).toBe('FULFILLED');

    await close();
  });
});
