import { createHmac, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Commerce } from '../src/commerce.js';
import type { TenantContext } from '../src/context.js';

const hasDb = Boolean(process.env.DATABASE_URL);

/**
 * GST invoicing: a tax invoice is generated on payment capture, splitting the
 * already-charged tax into CGST+SGST (intra-state) or IGST (inter-state) per the
 * place of supply, with HSN per line; refunds raise a credit note.
 */
describe.skipIf(!hasDb)('GST invoicing & accounting', () => {
  const prisma = new PrismaClient();
  const commerce = new Commerce(prisma);
  let ctx: TenantContext;
  let storeId: string;
  let variantId: string; // 18% GST product

  // Drive a real capture through the signed webhook so the invoice hook fires.
  async function capturedOrder(opts: { state?: string; gstin?: string; email?: string; qty?: number } = {}) {
    const email = opts.email ?? `buyer+${randomBytes(3).toString('hex')}@example.com`;
    const customer = await commerce.customers.create(ctx, { storeId, name: 'Asha Buyer', email });
    const { order } = await commerce.payments.checkout(ctx, {
      storeId,
      customerId: customer.id,
      items: [{ variantId, quantity: opts.qty ?? 2 }],
      email,
      shippingAddress: opts.state
        ? { name: 'Asha Buyer', line1: '12 MG Road', city: 'City', state: opts.state, pincode: '560001', ...(opts.gstin ? { gstin: opts.gstin } : {}) }
        : undefined,
    });
    const providerRef = order.payment!.providerRef!;
    const body = JSON.stringify({ providerRef, status: 'CAPTURED' });
    const sig = createHmac('sha256', 's').update(body).digest('hex');
    await commerce.payments.handleWebhook('RAZORPAY', body, sig);
    return order;
  }

  beforeAll(async () => {
    process.env.CORE_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
    const tenant = await prisma.tenant.create({ data: { name: 'Invoice Co' } });
    ctx = { tenantId: tenant.id };
    const store = await commerce.stores.create(ctx, { name: 'Spice Mart' });
    storeId = store.id;
    // Seller is GST-registered in Karnataka (29).
    await commerce.stores.setTaxIdentity(ctx, storeId, {
      legalName: 'Spice Mart Pvt Ltd',
      gstin: '29ABCDE1234F1Z5',
      taxAddressLine1: '1 Industrial Layout',
      taxCity: 'Bengaluru',
      taxState: 'Karnataka',
      taxPincode: '560001',
    });
    // 18% GST, tax added on top of prices.
    await commerce.checkoutSettings.set(ctx, { storeId, taxBps: 1800, taxLabel: 'GST' });
    await commerce.integrations.configure(ctx, { storeId, provider: 'RAZORPAY', credentials: { webhookSecret: 's' } });
    const product = await commerce.products.create(ctx, {
      storeId,
      title: 'Garam Masala 200g',
      status: 'ACTIVE',
      hsnCode: '0910',
      gstRateBps: 1800,
      variants: [{ priceMinor: 100000, inventory: 100 }], // ₹1000
    });
    variantId = product.variants[0].id;
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: ctx.tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('issues a sequential tax invoice on capture with seller GSTIN + HSN', async () => {
    const order = await capturedOrder({ state: 'Karnataka' });
    const inv = await commerce.invoices.getByOrder(ctx, order.id);
    expect(inv.invoiceNo).toMatch(/^INV-\d{4}$/);
    expect(inv.isTaxInvoice).toBe(true);
    expect(inv.sellerGstin).toBe('29ABCDE1234F1Z5');
    expect(inv.lines[0].hsnCode).toBe('0910');
    expect(inv.lines[0].gstRateBps).toBe(1800);
    // Subtotal ₹2000, GST 18% = ₹360. Total ₹2360.
    expect(inv.taxableMinor).toBe(200000);
    expect(inv.taxMinor).toBe(36000);
    expect(inv.totalMinor).toBe(order.totalMinor);
    expect(inv.totalMinor).toBe(236000);
  });

  it('splits CGST + SGST for an intra-state (same-state) delivery', async () => {
    const order = await capturedOrder({ state: 'Karnataka' });
    const inv = await commerce.invoices.getByOrder(ctx, order.id);
    expect(inv.intraState).toBe(true);
    expect(inv.igstMinor).toBe(0);
    expect(inv.cgstMinor).toBe(18000);
    expect(inv.sgstMinor).toBe(18000);
    expect(inv.cgstMinor + inv.sgstMinor).toBe(inv.taxMinor);
    expect(inv.placeOfSupplyCode).toBe('29');
  });

  it('charges IGST for an inter-state (different-state) delivery', async () => {
    const order = await capturedOrder({ state: 'Maharashtra' });
    const inv = await commerce.invoices.getByOrder(ctx, order.id);
    expect(inv.intraState).toBe(false);
    expect(inv.igstMinor).toBe(36000);
    expect(inv.cgstMinor).toBe(0);
    expect(inv.sgstMinor).toBe(0);
    expect(inv.placeOfSupplyCode).toBe('27');
  });

  it('records the buyer GSTIN for a B2B invoice', async () => {
    const order = await capturedOrder({ state: 'Maharashtra', gstin: '27PQRST5678G1Z3' });
    const inv = await commerce.invoices.getByOrder(ctx, order.id);
    expect(inv.buyerGstin).toBe('27PQRST5678G1Z3');
    expect(inv.buyerName).toBe('Asha Buyer');
  });

  it('is idempotent — capturing twice does not create a second invoice', async () => {
    const order = await capturedOrder({ state: 'Karnataka' });
    const again = await commerce.invoices.generateForOrder(ctx, order.id);
    const all = await prisma.invoice.findMany({ where: { orderId: order.id } });
    expect(all).toHaveLength(1);
    expect(again.id).toBe(all[0].id);
  });

  it('renders a printable HTML tax invoice', async () => {
    const order = await capturedOrder({ state: 'Karnataka' });
    const inv = await commerce.invoices.getByOrder(ctx, order.id);
    const html = commerce.invoices.renderHtml(inv);
    expect(html).toContain('Tax Invoice');
    expect(html).toContain('29ABCDE1234F1Z5');
    expect(html).toContain('CGST');
    expect(html).toContain('0910');
  });

  it('raises a credit note that reverses the proportional tax on a refund', async () => {
    const order = await capturedOrder({ state: 'Karnataka', email: 'cn@example.com' });
    const ret = await commerce.returns.request(ctx, { orderId: order.id });
    await commerce.returns.approve(ctx, ret.id);
    const refunded = await commerce.returns.refund(ctx, ret.id); // refunds the ₹2000 item value
    const cn = await prisma.creditNote.findFirst({ where: { orderId: order.id } });
    expect(cn).toBeTruthy();
    expect(cn!.creditNoteNo).toMatch(/^CN-\d{4}$/);
    // The credit note's total equals the refunded amount and reverses the tax in it.
    expect(cn!.totalMinor).toBe(refunded.refundMinor);
    expect(cn!.taxMinor).toBeGreaterThan(0);
    expect(cn!.intraState).toBe(true);
    expect(cn!.cgstMinor + cn!.sgstMinor).toBe(cn!.taxMinor);
    expect(cn!.taxableMinor + cn!.taxMinor + cn!.shippingMinor).toBe(cn!.totalMinor);
  });

  it('produces a sales register and a P&L-lite summary', async () => {
    const reg = await commerce.accounting.salesRegister(ctx, { storeId });
    expect(reg.invoiceCount).toBeGreaterThanOrEqual(5);
    expect(reg.rows.some((r) => r.type === 'CREDIT_NOTE')).toBe(true);

    const csv = await commerce.accounting.salesRegisterCsv(ctx, { storeId });
    expect(csv.split('\n')[0]).toContain('Taxable Value');
    expect(csv).toContain('INV-0001');

    const pnl = await commerce.accounting.profitAndLoss(ctx, { storeId });
    expect(pnl.netRevenueMinor).toBeLessThan(pnl.grossRevenueMinor); // a refund happened
    expect(pnl.taxCollectedMinor).toBeGreaterThan(0);
  });

  it('issues a plain (non-tax) invoice when the seller has no GSTIN', async () => {
    const t = await prisma.tenant.create({ data: { name: 'Unreg Co' } });
    const ctx2: TenantContext = { tenantId: t.id };
    const store = await commerce.stores.create(ctx2, { name: 'Tiny Shop' });
    await commerce.integrations.configure(ctx2, { storeId: store.id, provider: 'RAZORPAY', credentials: { webhookSecret: 's' } });
    const product = await commerce.products.create(ctx2, {
      storeId: store.id,
      title: 'Candle',
      status: 'ACTIVE',
      variants: [{ priceMinor: 50000, inventory: 10 }],
    });
    const { order } = await commerce.payments.checkout(ctx2, { storeId: store.id, items: [{ variantId: product.variants[0].id, quantity: 1 }] });
    const body = JSON.stringify({ providerRef: order.payment!.providerRef, status: 'CAPTURED' });
    await commerce.payments.handleWebhook('RAZORPAY', body, createHmac('sha256', 's').update(body).digest('hex'));
    const inv = await commerce.invoices.getByOrder(ctx2, order.id);
    expect(inv.isTaxInvoice).toBe(false);
    expect(inv.totalMinor).toBe(order.totalMinor);
    await prisma.tenant.delete({ where: { id: t.id } }).catch(() => undefined);
  });
});
