import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import { AuthError, type TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('buyer accounts (email-OTP)', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;
  const email = 'buyer@example.com';

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Account Co' } });
    ctx = { tenantId: tenant.id };
    const store = await commerce.stores.create(ctx, { name: 'Account Mart' });
    storeId = store.id;
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  async function signIn() {
    const { devCode } = await commerce.customerAuth.requestOtp(storeId, email);
    expect(devCode).toMatch(/^\d{6}$/);
    const { token } = await commerce.customerAuth.verifyOtp(storeId, email, devCode!, 'Test Buyer');
    return token;
  }

  it('issues a session on correct code and creates a customer', async () => {
    const token = await signIn();
    const me = await commerce.customerAuth.me(token);
    expect(me.email).toBe(email);
    expect(me.name).toBe('Test Buyer');
    const customer = await prisma.customer.findFirst({ where: { storeId, email } });
    expect(customer).toBeTruthy();
  });

  it('rejects an incorrect code', async () => {
    await commerce.customerAuth.requestOtp(storeId, email);
    await expect(commerce.customerAuth.verifyOtp(storeId, email, '000000')).rejects.toBeInstanceOf(AuthError);
  });

  it('rejects an invalid/expired session token', async () => {
    await expect(commerce.customerAuth.me('csa_nope')).rejects.toBeInstanceOf(AuthError);
  });

  it('saves addresses; the first is default, and default switches on demand', async () => {
    const token = await signIn();
    const a1 = await commerce.customerAuth.addAddress(token, { line1: '12 MG Road', city: 'Bengaluru', pincode: '560001' });
    expect(a1.isDefault).toBe(true);
    const a2 = await commerce.customerAuth.addAddress(token, { line1: '7 Park St', city: 'Kolkata', isDefault: true });
    expect(a2.isDefault).toBe(true);
    const list = await commerce.customerAuth.listAddresses(token);
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe(a2.id); // default first
    const a1after = list.find((a) => a.id === a1.id)!;
    expect(a1after.isDefault).toBe(false);
    await commerce.customerAuth.removeAddress(token, a1.id);
    expect(await commerce.customerAuth.listAddresses(token)).toHaveLength(1);
  });

  it('logout invalidates the session', async () => {
    const token = await signIn();
    await commerce.customerAuth.logout(token);
    await expect(commerce.customerAuth.me(token)).rejects.toBeInstanceOf(AuthError);
  });
});
