import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { AuthError, ValidationError, type TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('partner dashboard', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  const created: string[] = []; // tenant ids to clean up
  let partnerId: string;
  let clientTenantId: string;

  // Create a tenant with a store + a paid order of `gmvMinor`.
  async function clientWithSales(name: string, gmvMinor: number) {
    const tenant = await prisma.tenant.create({ data: { name } });
    created.push(tenant.id);
    const ctx: TenantContext = { tenantId: tenant.id };
    const store = await commerce.stores.create(ctx, { name: `${name} Store` });
    const product = await commerce.products.create(ctx, { storeId: store.id, title: 'Item', status: 'ACTIVE', variants: [{ priceMinor: gmvMinor, inventory: 10 }] });
    await prisma.order.create({
      data: {
        tenantId: tenant.id,
        storeId: store.id,
        number: 1,
        status: 'PAID',
        totalMinor: gmvMinor,
        items: { create: [{ tenantId: tenant.id, variantId: product.variants[0].id, title: 'Item', quantity: 1, unitPriceMinor: gmvMinor }] },
      },
    });
    return tenant.id;
  }

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const partner = await commerce.partners.createPartner({ name: 'Acme Agency', email: 'agency@example.com', commissionPercent: 20 });
    partnerId = partner.id;
    clientTenantId = await clientWithSales('Client A', 1_000_000); // ₹10,000 GMV
    const clientB = await clientWithSales('Client B', 500_000); // ₹5,000
    await commerce.partners.addClient(partnerId, { tenantId: clientTenantId, monthlyFeeMinor: 200000, renewsAt: new Date(Date.now() + 5 * 86_400_000) });
    await commerce.partners.addClient(partnerId, { tenantId: clientB, monthlyFeeMinor: 100000, renewsAt: new Date(Date.now() + 60 * 86_400_000) });
  });

  afterAll(async () => {
    await prisma.partner.deleteMany({ where: { email: 'agency@example.com' } }).catch(() => undefined);
    for (const id of created) await prisma.tenant.delete({ where: { id } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('validates partner creation and prevents duplicate emails', async () => {
    await expect(commerce.partners.createPartner({ name: 'X', email: 'bad' })).rejects.toBeInstanceOf(ValidationError);
    await expect(commerce.partners.createPartner({ name: 'Dup', email: 'agency@example.com' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('prevents assigning the same client to two partners', async () => {
    const other = await commerce.partners.createPartner({ name: 'Other', email: 'other@example.com' });
    await expect(commerce.partners.addClient(other.id, { tenantId: clientTenantId })).rejects.toBeInstanceOf(ValidationError);
    await prisma.partner.delete({ where: { id: other.id } });
  });

  it('computes dashboard GMV, commission earnings, and MRR', async () => {
    const dash = await commerce.partners.dashboard(partnerId);
    expect(dash.clientCount).toBe(2);
    expect(dash.gmvMinor).toBe(1_500_000); // 10k + 5k
    // 20% commission on 1,500,000 = 300,000.
    expect(dash.earningsMinor).toBe(300_000);
    // MRR = 200000 + 100000.
    expect(dash.mrrMinor).toBe(300_000);
    expect(dash.topClients[0].gmvMinor).toBe(1_000_000); // Client A leads
  });

  it('lists upcoming renewals soonest-first within the window', async () => {
    const renewals = await commerce.partners.renewals(partnerId, 30);
    // Only Client A renews within 30 days (Client B is 60 days out).
    expect(renewals).toHaveLength(1);
    expect(renewals[0].name).toBe('Client A');
    expect(renewals[0].monthlyFeeMinor).toBe(200000);
  });

  it('delegates client-store admin to the partner, governed by the access level', async () => {
    // Default MANAGE → full permissions on the client tenant.
    const manage = await commerce.partners.resolveDelegatedContext(partnerId, clientTenantId);
    expect(manage.tenantId).toBe(clientTenantId);
    expect(manage.actor?.kind).toBe('partner');
    expect(manage.actor?.permissions).toContain('products:write');
    // The partner can actually create a product on the client store.
    const product = await commerce.products.create(manage, { storeId: (await commerce.stores.list(manage))[0].id, title: 'Partner-added', status: 'ACTIVE', variants: [{ priceMinor: 1000 }] });
    expect(product.title).toBe('Partner-added');

    // Client downgrades to VIEW → read-only.
    await commerce.partners.setAccessForTenant(clientTenantId, 'VIEW');
    const view = await commerce.partners.resolveDelegatedContext(partnerId, clientTenantId);
    expect(view.actor?.permissions).toContain('products:read');
    expect(view.actor?.permissions).not.toContain('products:write');

    // Client revokes entirely → denied.
    await commerce.partners.setAccessForTenant(clientTenantId, 'NONE');
    await expect(commerce.partners.resolveDelegatedContext(partnerId, clientTenantId)).rejects.toBeTruthy();

    // A partner cannot manage a tenant that isn't its client.
    const stranger = await prisma.tenant.create({ data: { name: 'Stranger' } });
    created.push(stranger.id);
    await expect(commerce.partners.resolveDelegatedContext(partnerId, stranger.id)).rejects.toBeTruthy();

    // Restore MANAGE for later assertions.
    await commerce.partners.setAccessForTenant(clientTenantId, 'MANAGE');
  });

  it('reports the managing partner + access level to the client', async () => {
    const access = await commerce.partners.getAccessForTenant(clientTenantId);
    expect(access.partner?.email).toBe('agency@example.com');
    expect(access.accessLevel).toBe('MANAGE');
  });

  it('lets a partner self-serve: create a new client and edit its plan', async () => {
    const before = (await commerce.partners.clients(partnerId)).length;
    const res = await commerce.partners.createClientForPartner(partnerId, {
      businessName: 'Fresh Client',
      ownerEmail: `fresh+${randomBytes(4).toString('hex')}@example.com`,
      monthlyFeeMinor: 150000,
      renewsAt: new Date(Date.now() + 20 * 86_400_000),
    });
    created.push(res.tenantId);
    expect(res.apiKey).toMatch(/^sk_/); // a usable workspace key to hand off

    const clients = await commerce.partners.clients(partnerId);
    expect(clients.length).toBe(before + 1);
    const mine = clients.find((c) => c.tenantId === res.tenantId)!;
    expect(mine.name).toBe('Fresh Client');
    expect(mine.monthlyFeeMinor).toBe(150000);
    expect(mine.accessLevel).toBe('MANAGE'); // partner created it → full access by default

    // Edit the plan fee.
    await commerce.partners.updateClientForPartner(partnerId, mine.clientId, { monthlyFeeMinor: 250000 });
    const after = (await commerce.partners.clients(partnerId)).find((c) => c.clientId === mine.clientId)!;
    expect(after.monthlyFeeMinor).toBe(250000);

    // A partner cannot edit another partner's client.
    const other = await commerce.partners.createPartner({ name: 'Other2', email: `other2+${randomBytes(4).toString('hex')}@example.com` });
    await expect(commerce.partners.updateClientForPartner(other.id, mine.clientId, { monthlyFeeMinor: 1 })).rejects.toBeTruthy();
    await prisma.partner.delete({ where: { id: other.id } }).catch(() => undefined);
  });

  it('authenticates a partner via magic link and resolves a session', async () => {
    const { token } = await commerce.partnerAuth.requestMagicLink('AGENCY@example.com');
    expect(token).toBeTruthy();
    const session = await commerce.partnerAuth.verifyMagicLink(token!);
    expect(session.partner.email).toBe('agency@example.com');
    const ctx = await commerce.partnerAuth.resolveSession(session.token);
    expect(ctx.partnerId).toBe(partnerId);

    // Unknown email yields no token; bad session rejected.
    const none = await commerce.partnerAuth.requestMagicLink('nobody@example.com');
    expect(none.token).toBeNull();
    await expect(commerce.partnerAuth.resolveSession('pts_nope')).rejects.toBeInstanceOf(AuthError);
  });
});
