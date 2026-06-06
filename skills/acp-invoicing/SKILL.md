---
name: acp-invoicing
description: Use when the user wants GST tax invoices, billing, credit notes, a sales register, or basic accounting / P&L on their ACP store via the Claude connector — set up the seller's GSTIN & registered address, set HSN codes / GST rates on products, view or print a tax invoice, see CGST/SGST/IGST, raise a credit note on a refund, export the sales register CSV (Tally/Zoho-shaped), or check revenue/COGS/profit. Triggers on "GST invoice", "tax invoice", "GSTIN", "HSN code", "CGST SGST IGST", "place of supply", "credit note", "sales register", "GSTR", "profit and loss", "P&L", "accounting", "bill of supply". Drives set_store_tax_identity, list_invoices, get_invoice, list_credit_notes, sales_register, profit_and_loss.
---

# GST invoicing & accounting

The platform auto-issues a **GST tax invoice on every paid order** and a **credit note on every refund**, then rolls them up into a sales register + P&L. You configure the seller identity and per-product tax classification; the documents generate themselves.

## 1. Seller tax identity (do this first)
`set_store_tax_identity` with `storeId` records what the law requires the invoice to state about the seller:
- `legalName` — registered business name (falls back to the store name).
- `gstin` — 15-char GSTIN. **Its presence turns invoices into "Tax Invoices"** with split GST; without it you get a plain bill of supply. The seller's state code is derived from the GSTIN's first two digits.
- `pan`, `taxAddressLine1/2`, `taxCity`, `taxState` (name or 2-digit code), `taxPincode` — the registered place of business (printed as the seller address and used to decide intra- vs inter-state tax).
- `invoicePrefix` / `creditNotePrefix` — number-series prefixes (default `INV` / `CN`).

Read it back with `get_store_tax_identity`.

## 2. Product tax classification
On `create_product` / `update_product` set:
- `hsnCode` — the HSN/SAC code printed per line.
- `gstRateBps` — per-product GST rate in basis points (1800 = 18%). When unset, the store-level checkout tax rate (`set_checkout_settings` → `taxBps`) applies.

## 3. How the tax splits (CGST+SGST vs IGST)
The **place of supply** is the buyer's delivery state. The total GST is whatever was charged at checkout; the invoice just splits it:
- **Intra-state** (seller state == place of supply) → **CGST + SGST**, each half the rate.
- **Inter-state** (different states) → **IGST**, the full rate.
A B2B buyer's GSTIN (captured at checkout in the shipping address) is recorded on the invoice.

## 4. View / print invoices (item 2)
- `list_invoices` (`storeId`, optional `from`/`to`) — invoice no, buyer, place of supply, tax, total.
- `get_invoice` (`orderId` or `id`) — full document with per-line HSN, taxable value, CGST/SGST/IGST.
- In the admin, **Invoicing** lists every invoice with a "View / print" link (a printable HTML tax invoice). Buyers can download their own from the storefront Track page.

## 5. Credit notes on refunds (item 3)
When a return is refunded (or a buyer cancels a paid order), a **credit note** is auto-raised reversing the proportional tax, with its own number series. List them with `list_credit_notes`.

## 6. Sales register & P&L (item 4)
- `sales_register` (`storeId`, `from`, `to`) — every invoice + credit note with taxable value and CGST/SGST/IGST, plus totals. Pass `csv:true` for a Tally/Zoho-Books-shaped CSV export.
- `profit_and_loss` — net revenue (invoices − credit notes), GST collected, COGS (unit cost × qty), gross profit and margin. (PSP/processing fees aren't tracked in this build.)

## Tips
- Invoices are **idempotent per order** and **sequential per store** — re-capturing never duplicates them.
- If the seller has no GSTIN, documents still generate as a plain bill (CGST/SGST/IGST = 0).
- Set the seller GSTIN/address **before** taking orders so early invoices carry the right identity.
