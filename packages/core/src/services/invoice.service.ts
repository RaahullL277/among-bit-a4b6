import type { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError, type TenantContext } from '../context.js';
import type { CheckoutSettingsService } from './checkout-settings.service.js';
import { resolveStateCode, stateCodeFromGstin, stateName } from '../tax/india-states.js';

/**
 * Distribute `total` across `weights` so the parts are proportional to the
 * weights AND sum back to exactly `total` (largest-remainder method). Used to
 * split an order's discount and GST across its lines without rounding drift.
 */
function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum <= 0 || total === 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum);
  const floors = exact.map((x) => Math.floor(x));
  let remainder = total - floors.reduce((s, f) => s + f, 0);
  // Hand the leftover units to the lines with the largest fractional parts.
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floors];
  for (let k = 0; k < order.length && remainder > 0; k++) {
    out[order[k].i] += 1;
    remainder -= 1;
  }
  return out;
}

interface PlaceOfSupply {
  name?: string;
  code?: string;
  intraState: boolean;
}

const invoiceInclude = { lines: true } as const;

/**
 * GST tax-invoicing. Generates a sequential, self-contained tax invoice per
 * paid order — snapshotting the seller's tax identity, the buyer's details,
 * the place of supply, and per-line HSN + taxable value + split CGST/SGST
 * (intra-state) or IGST (inter-state). Also generates credit notes for refunds.
 *
 * Key GST fact this relies on: CGST + SGST == IGST == the total tax already
 * charged at checkout. So the invoice never re-computes the tax total — it
 * splits the order's `taxMinor` by place of supply, keeping the invoice total
 * exactly equal to what the buyer paid.
 */
export class InvoiceService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly checkoutSettings: CheckoutSettingsService,
  ) {}

  // --- Generation (called on payment capture) -------------------------------

  /**
   * Generate (idempotently) the tax invoice for a paid order. Safe to call more
   * than once — returns the existing invoice if one was already issued.
   */
  async generateForOrder(ctx: TenantContext, orderId: string) {
    const existing = await this.prisma.invoice.findUnique({ where: { orderId }, include: invoiceInclude });
    if (existing && existing.tenantId === ctx.tenantId) return existing;

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId: ctx.tenantId },
      include: { items: true, customer: true, store: true },
    });
    if (!order) throw new NotFoundError('Order', orderId);
    const store = order.store;

    const settings = await this.checkoutSettings.resolve(store.id);
    const pricesIncludeTax = settings.pricesIncludeTax;

    // Per-line HSN + GST rate come from the product behind each variant.
    const variantIds = order.items.map((i) => i.variantId).filter((v): v is string => Boolean(v));
    const variants = variantIds.length
      ? await this.prisma.productVariant.findMany({
          where: { id: { in: variantIds } },
          select: { id: true, product: { select: { hsnCode: true, gstRateBps: true } } },
        })
      : [];
    const productByVariant = new Map(variants.map((v) => [v.id, v.product]));

    // 1) Allocate the order discount across the lines (proportional to gross).
    const gross = order.items.map((i) => i.unitPriceMinor * i.quantity);
    const lineDiscount = allocate(order.discountMinor, gross);
    const netLine = gross.map((g, i) => g - lineDiscount[i]);

    // 2) Allocate the already-charged tax across the lines (proportional to net).
    const lineTax = allocate(order.taxMinor, netLine);

    // 3) Resolve the place of supply (drives CGST/SGST vs IGST).
    const sellerStateCode = store.taxStateCode || stateCodeFromGstin(store.gstin);
    const pos = this.placeOfSupply(order.shippingAddress, sellerStateCode);

    const lines = order.items.map((item, i) => {
      const prod = item.variantId ? productByVariant.get(item.variantId) : undefined;
      const gstRateBps = prod?.gstRateBps ?? settings.taxBps;
      // Taxable value (ex-tax): for tax-inclusive pricing, strip the tax out.
      const taxableMinor = pricesIncludeTax ? netLine[i] - lineTax[i] : netLine[i];
      const tax = lineTax[i];
      const cgst = pos.intraState ? Math.floor(tax / 2) : 0;
      const sgst = pos.intraState ? tax - cgst : 0;
      const igst = pos.intraState ? 0 : tax;
      const unitPriceMinor = item.quantity > 0 ? Math.round(taxableMinor / item.quantity) : taxableMinor;
      return {
        title: item.title,
        hsnCode: prod?.hsnCode ?? null,
        quantity: item.quantity,
        unitPriceMinor,
        taxableMinor,
        gstRateBps,
        cgstMinor: cgst,
        sgstMinor: sgst,
        igstMinor: igst,
      };
    });

    const taxableMinor = lines.reduce((s, l) => s + l.taxableMinor, 0);
    const cgstMinor = lines.reduce((s, l) => s + l.cgstMinor, 0);
    const sgstMinor = lines.reduce((s, l) => s + l.sgstMinor, 0);
    const igstMinor = lines.reduce((s, l) => s + l.igstMinor, 0);
    const taxMinor = cgstMinor + sgstMinor + igstMinor;
    const totalMinor = order.totalMinor;
    const roundOffMinor = totalMinor - (taxableMinor + taxMinor + order.shippingMinor);

    const addr = (order.shippingAddress ?? null) as Record<string, unknown> | null;
    const buyerGstin = (addr?.gstin as string | undefined) || undefined;
    const buyerName = (addr?.name as string | undefined) || order.customer?.name || undefined;
    const buyerEmail = order.email || order.customer?.email || undefined;

    const sellerAddress = {
      line1: store.taxAddressLine1 ?? undefined,
      line2: store.taxAddressLine2 ?? undefined,
      city: store.taxCity ?? undefined,
      state: store.taxState ?? (sellerStateCode ? stateName(sellerStateCode) : undefined),
      stateCode: sellerStateCode ?? undefined,
      pincode: store.taxPincode ?? undefined,
    };

    const created = await this.prisma.$transaction(async (tx) => {
      // Re-check inside the transaction to avoid a duplicate on a concurrent call.
      const dup = await tx.invoice.findUnique({ where: { orderId }, include: invoiceInclude });
      if (dup) return dup;
      const last = await tx.invoice.aggregate({ where: { storeId: store.id }, _max: { number: true } });
      const number = (last._max.number ?? 0) + 1;
      const invoiceNo = `${store.invoicePrefix || 'INV'}-${String(number).padStart(4, '0')}`;
      return tx.invoice.create({
        data: {
          tenantId: ctx.tenantId,
          storeId: store.id,
          orderId: order.id,
          number,
          invoiceNo,
          sellerName: store.name,
          sellerLegalName: store.legalName,
          sellerGstin: store.gstin,
          sellerPan: store.pan,
          sellerAddress: sellerAddress as Prisma.InputJsonValue,
          sellerStateCode: sellerStateCode,
          buyerName,
          buyerEmail,
          buyerGstin,
          buyerAddress: (addr ?? undefined) as Prisma.InputJsonValue | undefined,
          placeOfSupply: pos.name,
          placeOfSupplyCode: pos.code,
          intraState: pos.intraState,
          isTaxInvoice: Boolean(store.gstin),
          currency: order.currency,
          subtotalMinor: taxableMinor + order.discountMinor,
          discountMinor: order.discountMinor,
          taxableMinor,
          cgstMinor,
          sgstMinor,
          igstMinor,
          taxMinor,
          shippingMinor: order.shippingMinor,
          roundOffMinor,
          totalMinor,
          lines: { create: lines.map((l) => ({ tenantId: ctx.tenantId, ...l })) },
        },
        include: invoiceInclude,
      });
    });
    return created;
  }

  /** Resolve the place of supply (buyer's state) → intra/inter-state decision. */
  private placeOfSupply(shippingAddress: unknown, sellerStateCode?: string): PlaceOfSupply {
    const addr = (shippingAddress ?? null) as Record<string, unknown> | null;
    const buyerCode = resolveStateCode((addr?.state as string | undefined) ?? null);
    if (!buyerCode) {
      // Unknown delivery state → default to the seller's own state (intra-state).
      return {
        name: sellerStateCode ? stateName(sellerStateCode) : undefined,
        code: sellerStateCode,
        intraState: true,
      };
    }
    return {
      name: stateName(buyerCode),
      code: buyerCode,
      // Without a seller state we can't prove inter-state; treat as intra-state.
      intraState: !sellerStateCode || sellerStateCode === buyerCode,
    };
  }

  // --- Credit notes (called on refund) --------------------------------------

  /**
   * Generate (idempotently per return) a GST credit note reversing tax on a
   * refunded amount. `refundMinor` is the gross amount refunded to the buyer;
   * the note splits out the proportional taxable value + CGST/SGST or IGST.
   */
  async generateCreditNote(
    ctx: TenantContext,
    orderId: string,
    opts: { refundMinor: number; returnId?: string; reason?: string },
  ) {
    if (opts.returnId) {
      const existing = await this.prisma.creditNote.findUnique({ where: { returnId: opts.returnId } });
      if (existing) return existing;
    }
    const invoice = await this.prisma.invoice.findUnique({ where: { orderId } });
    if (!invoice || invoice.tenantId !== ctx.tenantId) {
      // No invoice (unpaid/never-invoiced order) → nothing to credit.
      return null;
    }
    const refund = Math.max(0, Math.round(opts.refundMinor));
    if (refund <= 0) return null;

    // Reverse proportionally to the share of the invoice total being refunded.
    const ratio = invoice.totalMinor > 0 ? Math.min(1, refund / invoice.totalMinor) : 0;
    const taxMinor = Math.round(invoice.taxMinor * ratio);
    const cgstMinor = invoice.intraState ? Math.floor(taxMinor / 2) : 0;
    const sgstMinor = invoice.intraState ? taxMinor - cgstMinor : 0;
    const igstMinor = invoice.intraState ? 0 : taxMinor;
    const shippingMinor = Math.round(invoice.shippingMinor * ratio);
    const taxableMinor = refund - taxMinor - shippingMinor;

    const created = await this.prisma.$transaction(async (tx) => {
      if (opts.returnId) {
        const dup = await tx.creditNote.findUnique({ where: { returnId: opts.returnId } });
        if (dup) return dup;
      }
      const last = await tx.creditNote.aggregate({ where: { storeId: invoice.storeId }, _max: { number: true } });
      const number = (last._max.number ?? 0) + 1;
      const store = await tx.store.findUnique({ where: { id: invoice.storeId }, select: { creditNotePrefix: true } });
      const creditNoteNo = `${store?.creditNotePrefix || 'CN'}-${String(number).padStart(4, '0')}`;
      return tx.creditNote.create({
        data: {
          tenantId: ctx.tenantId,
          storeId: invoice.storeId,
          invoiceId: invoice.id,
          orderId,
          returnId: opts.returnId,
          number,
          creditNoteNo,
          reason: opts.reason,
          currency: invoice.currency,
          taxableMinor,
          cgstMinor,
          sgstMinor,
          igstMinor,
          taxMinor,
          shippingMinor,
          totalMinor: refund,
          intraState: invoice.intraState,
        },
      });
    });
    return created;
  }

  // --- Read -----------------------------------------------------------------

  async get(ctx: TenantContext, id: string) {
    const inv = await this.prisma.invoice.findFirst({ where: { id, tenantId: ctx.tenantId }, include: invoiceInclude });
    if (!inv) throw new NotFoundError('Invoice', id);
    return inv;
  }

  async getByOrder(ctx: TenantContext, orderId: string) {
    const inv = await this.prisma.invoice.findFirst({ where: { orderId, tenantId: ctx.tenantId }, include: invoiceInclude });
    if (!inv) throw new NotFoundError('Invoice', orderId);
    return inv;
  }

  async list(ctx: TenantContext, opts: { storeId?: string; from?: string; to?: string; limit?: number } = {}) {
    const where: Prisma.InvoiceWhereInput = { tenantId: ctx.tenantId };
    if (opts.storeId) where.storeId = opts.storeId;
    if (opts.from || opts.to) {
      where.issuedAt = {};
      if (opts.from) where.issuedAt.gte = new Date(opts.from);
      if (opts.to) where.issuedAt.lte = new Date(opts.to);
    }
    return this.prisma.invoice.findMany({
      where,
      include: invoiceInclude,
      orderBy: { number: 'desc' },
      take: Math.min(opts.limit ?? 200, 1000),
    });
  }

  async creditNotes(ctx: TenantContext, opts: { storeId?: string } = {}) {
    return this.prisma.creditNote.findMany({
      where: { tenantId: ctx.tenantId, ...(opts.storeId ? { storeId: opts.storeId } : {}) },
      orderBy: { number: 'desc' },
      take: 500,
    });
  }

  // --- Buyer-facing (storefront) --------------------------------------------

  /** Fetch an invoice for a buyer who proves ownership with order number + email. */
  async getForBuyer(storeId: string, orderNumber: number, email: string) {
    if (!orderNumber || !email) return null;
    const order = await this.prisma.order.findFirst({
      where: { storeId, number: Number(orderNumber), customer: { email: { equals: email, mode: 'insensitive' } } },
      select: { id: true },
    });
    if (!order) return null;
    return this.prisma.invoice.findUnique({ where: { orderId: order.id }, include: invoiceInclude });
  }

  // --- HTML rendering (printable document; no PDF dependency) ----------------

  renderHtml(invoice: Awaited<ReturnType<InvoiceService['get']>>): string {
    return renderInvoiceHtml(invoice);
  }
}

// --- Standalone HTML renderer (used by REST + storefront) --------------------

function rupees(minor: number, currency = 'INR'): string {
  const sign = minor < 0 ? '-' : '';
  const v = Math.abs(minor) / 100;
  return `${sign}${currency === 'INR' ? '₹' : ''}${v.toFixed(2)}`;
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function addressBlock(a: Record<string, unknown> | null | undefined): string {
  if (!a) return '';
  const parts = [a.line1, a.line2, [a.city, a.state].filter(Boolean).join(', '), a.pincode]
    .filter(Boolean)
    .map((p) => esc(p));
  return parts.join('<br>');
}

/** Render a GST tax invoice (or bill of supply) as a self-contained, printable HTML page. */
export function renderInvoiceHtml(inv: any): string {
  const intra = inv.intraState;
  const seller = (inv.sellerAddress ?? null) as Record<string, unknown> | null;
  const buyer = (inv.buyerAddress ?? null) as Record<string, unknown> | null;
  const title = inv.isTaxInvoice ? 'Tax Invoice' : 'Invoice';
  const taxCols = intra
    ? '<th>Taxable</th><th>CGST</th><th>SGST</th>'
    : '<th>Taxable</th><th>IGST</th>';
  const rows = (inv.lines ?? [])
    .map((l: any) => {
      const rate = (l.gstRateBps / 100).toFixed(l.gstRateBps % 100 ? 2 : 0);
      const taxCells = intra
        ? `<td class="r">${rupees(l.taxableMinor, inv.currency)}</td><td class="r">${rupees(l.cgstMinor, inv.currency)}<div class="rate">${(l.gstRateBps / 200).toFixed(2)}%</div></td><td class="r">${rupees(l.sgstMinor, inv.currency)}<div class="rate">${(l.gstRateBps / 200).toFixed(2)}%</div></td>`
        : `<td class="r">${rupees(l.taxableMinor, inv.currency)}</td><td class="r">${rupees(l.igstMinor, inv.currency)}<div class="rate">${rate}%</div></td>`;
      return `<tr><td>${esc(l.title)}</td><td>${esc(l.hsnCode ?? '—')}</td><td class="r">${l.quantity}</td><td class="r">${rupees(l.unitPriceMinor, inv.currency)}</td>${taxCells}</tr>`;
    })
    .join('');

  const taxSummary = intra
    ? `<tr><td>CGST</td><td class="r">${rupees(inv.cgstMinor, inv.currency)}</td></tr>
       <tr><td>SGST</td><td class="r">${rupees(inv.sgstMinor, inv.currency)}</td></tr>`
    : `<tr><td>IGST</td><td class="r">${rupees(inv.igstMinor, inv.currency)}</td></tr>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} ${esc(inv.invoiceNo)}</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c1917;margin:0;padding:32px;background:#f5f5f4}
  .doc{max-width:780px;margin:0 auto;background:#fff;border:1px solid #e7e5e4;border-radius:12px;padding:32px}
  h1{font-size:20px;margin:0 0 2px}
  .muted{color:#78716c;font-size:12px}
  .row{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap}
  .party{font-size:13px;line-height:1.5;margin-top:16px}
  .party b{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#78716c;margin-bottom:3px}
  table{width:100%;border-collapse:collapse;margin-top:20px;font-size:13px}
  th,td{padding:8px 10px;text-align:left;border-bottom:1px solid #f0efed}
  th{font-size:11px;text-transform:uppercase;letter-spacing:.03em;color:#78716c;background:#fafaf9}
  .r{text-align:right}
  .rate{font-size:10px;color:#a8a29e}
  .totals{margin-top:16px;margin-left:auto;width:280px;font-size:13px}
  .totals td{border:0;padding:4px 10px}
  .totals .grand{font-weight:700;font-size:15px;border-top:2px solid #1c1917}
  .badge{display:inline-block;font-size:11px;padding:2px 8px;border-radius:999px;background:#f0efed;color:#57534e}
  @media print{body{background:#fff;padding:0}.doc{border:0}}
</style></head>
<body><div class="doc">
  <div class="row">
    <div>
      <h1>${esc(title)}</h1>
      <div class="muted">${esc(inv.invoiceNo)} · ${new Date(inv.issuedAt).toLocaleDateString('en-IN')}</div>
    </div>
    <div class="r">
      <div style="font-weight:600">${esc(inv.sellerLegalName || inv.sellerName)}</div>
      ${inv.sellerGstin ? `<div class="muted">GSTIN: ${esc(inv.sellerGstin)}</div>` : ''}
      ${inv.sellerPan ? `<div class="muted">PAN: ${esc(inv.sellerPan)}</div>` : ''}
    </div>
  </div>
  <div class="row">
    <div class="party"><b>Seller</b>${esc(inv.sellerLegalName || inv.sellerName)}<br>${addressBlock(seller)}</div>
    <div class="party"><b>Bill / Ship to</b>${esc(inv.buyerName ?? '—')}<br>${addressBlock(buyer)}${inv.buyerGstin ? `<br>GSTIN: ${esc(inv.buyerGstin)} <span class="badge">B2B</span>` : ''}</div>
    <div class="party"><b>Place of supply</b>${esc(inv.placeOfSupply ?? '—')}${inv.placeOfSupplyCode ? ` (${esc(inv.placeOfSupplyCode)})` : ''}<br><span class="badge">${intra ? 'Intra-state · CGST+SGST' : 'Inter-state · IGST'}</span></div>
  </div>
  <table>
    <thead><tr><th>Item</th><th>HSN/SAC</th><th class="r">Qty</th><th class="r">Rate</th>${taxCols}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <table class="totals">
    <tr><td>Taxable value</td><td class="r">${rupees(inv.taxableMinor, inv.currency)}</td></tr>
    ${inv.discountMinor ? `<tr><td>Discount</td><td class="r">-${rupees(inv.discountMinor, inv.currency)}</td></tr>` : ''}
    ${taxSummary}
    ${inv.shippingMinor ? `<tr><td>Shipping</td><td class="r">${rupees(inv.shippingMinor, inv.currency)}</td></tr>` : ''}
    ${inv.roundOffMinor ? `<tr><td>Round off</td><td class="r">${rupees(inv.roundOffMinor, inv.currency)}</td></tr>` : ''}
    <tr class="grand"><td>Total</td><td class="r">${rupees(inv.totalMinor, inv.currency)}</td></tr>
  </table>
  <p class="muted" style="margin-top:28px">This is a computer-generated ${inv.isTaxInvoice ? 'tax invoice' : 'document'} and does not require a signature.</p>
</div></body></html>`;
}
