import type { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, type TenantContext } from '../context.js';

interface RangeOpts {
  storeId?: string;
  from?: string;
  to?: string;
}

/**
 * Accounting layer over the invoice + credit-note ledger: a GST sales register
 * (with a Tally/Zoho-shaped CSV export) and a P&L-lite summary
 * (revenue − refunds − COGS). Read-only; the documents themselves are authored
 * by InvoiceService on payment capture / refund.
 */
export class AccountingService {
  constructor(private readonly prisma: PrismaClient) {}

  private range(opts: RangeOpts): { gte?: Date; lte?: Date } {
    const r: { gte?: Date; lte?: Date } = {};
    if (opts.from) r.gte = new Date(opts.from);
    if (opts.to) r.lte = new Date(opts.to);
    return r;
  }

  private async assertStore(ctx: TenantContext, storeId?: string) {
    if (!storeId) return;
    const store = await this.prisma.store.findFirst({ where: { id: storeId, tenantId: ctx.tenantId }, select: { id: true } });
    if (!store) throw new NotFoundError('Store', storeId);
  }

  /** The GST sales register: every invoice + credit note in the period. */
  async salesRegister(ctx: TenantContext, opts: RangeOpts = {}) {
    await this.assertStore(ctx, opts.storeId);
    const range = this.range(opts);
    const where: Prisma.InvoiceWhereInput = { tenantId: ctx.tenantId };
    if (opts.storeId) where.storeId = opts.storeId;
    if (range.gte || range.lte) where.issuedAt = range;

    const [invoices, creditNotes] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        orderBy: { number: 'asc' },
        include: { order: { select: { number: true } } },
      }),
      this.prisma.creditNote.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(opts.storeId ? { storeId: opts.storeId } : {}),
          ...(range.gte || range.lte ? { issuedAt: range } : {}),
        },
        orderBy: { number: 'asc' },
        include: { order: { select: { number: true } } },
      }),
    ]);

    const invRows = invoices.map((i) => ({
      type: 'INVOICE' as const,
      documentNo: i.invoiceNo,
      date: i.issuedAt,
      orderNumber: i.order.number,
      buyerName: i.buyerName,
      buyerGstin: i.buyerGstin,
      placeOfSupply: i.placeOfSupply,
      intraState: i.intraState,
      taxableMinor: i.taxableMinor,
      cgstMinor: i.cgstMinor,
      sgstMinor: i.sgstMinor,
      igstMinor: i.igstMinor,
      taxMinor: i.taxMinor,
      shippingMinor: i.shippingMinor,
      totalMinor: i.totalMinor,
      currency: i.currency,
    }));
    // Credit notes are reversals → negative amounts in the register.
    const cnRows = creditNotes.map((c) => ({
      type: 'CREDIT_NOTE' as const,
      documentNo: c.creditNoteNo,
      date: c.issuedAt,
      orderNumber: c.order.number,
      buyerName: null as string | null,
      buyerGstin: null as string | null,
      placeOfSupply: null as string | null,
      intraState: c.intraState,
      taxableMinor: -c.taxableMinor,
      cgstMinor: -c.cgstMinor,
      sgstMinor: -c.sgstMinor,
      igstMinor: -c.igstMinor,
      taxMinor: -c.taxMinor,
      shippingMinor: -c.shippingMinor,
      totalMinor: -c.totalMinor,
      currency: c.currency,
    }));

    const rows = [...invRows, ...cnRows].sort((a, b) => a.date.getTime() - b.date.getTime());
    const totals = rows.reduce(
      (t, r) => ({
        taxableMinor: t.taxableMinor + r.taxableMinor,
        cgstMinor: t.cgstMinor + r.cgstMinor,
        sgstMinor: t.sgstMinor + r.sgstMinor,
        igstMinor: t.igstMinor + r.igstMinor,
        taxMinor: t.taxMinor + r.taxMinor,
        totalMinor: t.totalMinor + r.totalMinor,
      }),
      { taxableMinor: 0, cgstMinor: 0, sgstMinor: 0, igstMinor: 0, taxMinor: 0, totalMinor: 0 },
    );

    return {
      from: range.gte ?? null,
      to: range.lte ?? null,
      invoiceCount: invoices.length,
      creditNoteCount: creditNotes.length,
      rows,
      totals,
    };
  }

  /** The sales register as a Tally/Zoho-Books-shaped CSV string. */
  async salesRegisterCsv(ctx: TenantContext, opts: RangeOpts = {}): Promise<string> {
    const reg = await this.salesRegister(ctx, opts);
    const headers = [
      'Type', 'Document No', 'Date', 'Order', 'Buyer', 'Buyer GSTIN', 'Place of Supply',
      'Supply Type', 'Taxable Value', 'CGST', 'SGST', 'IGST', 'Total Tax', 'Total',
    ];
    const money = (m: number) => (m / 100).toFixed(2);
    const cell = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(',')];
    for (const r of reg.rows) {
      lines.push(
        [
          r.type,
          r.documentNo,
          new Date(r.date).toISOString().slice(0, 10),
          `#${r.orderNumber}`,
          r.buyerName ?? '',
          r.buyerGstin ?? '',
          r.placeOfSupply ?? '',
          r.intraState ? 'Intra-state' : 'Inter-state',
          money(r.taxableMinor),
          money(r.cgstMinor),
          money(r.sgstMinor),
          money(r.igstMinor),
          money(r.taxMinor),
          money(r.totalMinor),
        ].map(cell).join(','),
      );
    }
    lines.push(
      ['TOTAL', '', '', '', '', '', '', '', money(reg.totals.taxableMinor), money(reg.totals.cgstMinor), money(reg.totals.sgstMinor), money(reg.totals.igstMinor), money(reg.totals.taxMinor), money(reg.totals.totalMinor)]
        .map(cell)
        .join(','),
    );
    return lines.join('\n');
  }

  /** P&L-lite: net revenue (invoices − credit notes), GST collected, COGS, gross profit. */
  async profitAndLoss(ctx: TenantContext, opts: RangeOpts = {}) {
    await this.assertStore(ctx, opts.storeId);
    const range = this.range(opts);
    const invWhere: Prisma.InvoiceWhereInput = { tenantId: ctx.tenantId };
    if (opts.storeId) invWhere.storeId = opts.storeId;
    if (range.gte || range.lte) invWhere.issuedAt = range;

    const invoices = await this.prisma.invoice.findMany({
      where: invWhere,
      select: { orderId: true, taxableMinor: true, taxMinor: true, totalMinor: true, shippingMinor: true },
    });
    const creditNotes = await this.prisma.creditNote.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(opts.storeId ? { storeId: opts.storeId } : {}),
        ...(range.gte || range.lte ? { issuedAt: range } : {}),
      },
      select: { taxableMinor: true, taxMinor: true, totalMinor: true },
    });

    const grossRevenueMinor = invoices.reduce((s, i) => s + i.taxableMinor, 0);
    const taxInvoicedMinor = invoices.reduce((s, i) => s + i.taxMinor, 0);
    const refundsMinor = creditNotes.reduce((s, c) => s + c.taxableMinor, 0);
    const taxRefundedMinor = creditNotes.reduce((s, c) => s + c.taxMinor, 0);
    const netRevenueMinor = grossRevenueMinor - refundsMinor;
    const taxCollectedMinor = taxInvoicedMinor - taxRefundedMinor;

    // COGS: unit cost × quantity across the invoiced orders' line items.
    const orderIds = invoices.map((i) => i.orderId);
    const items = orderIds.length
      ? await this.prisma.orderItem.findMany({
          where: { orderId: { in: orderIds } },
          select: { quantity: true, variant: { select: { costMinor: true } } },
        })
      : [];
    const cogsMinor = items.reduce((s, it) => s + it.quantity * (it.variant?.costMinor ?? 0), 0);

    // Fees are not tracked in this build (no live PSP fee feed) → reported as 0.
    const feesMinor = 0;
    const grossProfitMinor = netRevenueMinor - cogsMinor - feesMinor;

    return {
      from: range.gte ?? null,
      to: range.lte ?? null,
      currency: 'INR',
      invoiceCount: invoices.length,
      creditNoteCount: creditNotes.length,
      grossRevenueMinor,
      refundsMinor,
      netRevenueMinor,
      cogsMinor,
      feesMinor,
      grossProfitMinor,
      grossMarginPercent: netRevenueMinor > 0 ? Math.round((grossProfitMinor / netRevenueMinor) * 1000) / 10 : 0,
      taxCollectedMinor,
      note: 'P&L-lite. COGS = unit cost × qty on invoiced orders; PSP/processing fees are not tracked (0).',
    };
  }
}
