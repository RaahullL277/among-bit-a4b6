# TODO — Roadmap & Backlog

Pending build items, grounded in the codebase. Each maps to the standard
agentic-first pattern: **core service → REST + MCP tool → admin/storefront UI →
SKILL.md → tests**. Severity tags follow `AUDIT.md` (P0 = go-live blocker · P1 =
core capability gap · P2 = polish).

---

## Compliance, onboarding & migration (investigated 2026-06-06)

### 1. Legal pages — Terms of Use & Privacy Policy — ✅ BUILT
`LegalPolicy` model (TERMS / PRIVACY / SHIPPING / REFUND / COOKIES), versioned per
store. India/GST-aware template generator seeded from the seller tax identity +
return policy (`LegalService`, `legal/templates.ts`). Surfaces: REST `/legal`,
MCP (`generate_legal_policies`, `get_legal_policy`, `set_legal_policy`,
`publish_legal_policy`, `list_legal_policies`), admin **Legal** page, storefront
footer links + `/legal/:type` policy pages, `acp-legal` skill, tests.
- [x] (Follow-up) Buyer-acceptance capture at checkout — `LegalAcceptance` model + `requireLegalAcceptance` checkout gate; records the policy versions in force per order/email; storefront checkbox; `list_legal_acceptances`.

### 2. eKYC / merchant verification & payouts — ❌ not built (P0 for real go-live)
Entirely absent — no `kyc` / `aadhaar` / `bankAccount` / `payout` / `ifsc` /
business-verification anywhere. `Store.gstin` / `Store.pan` exist **only as
invoice print identity** and are never verified. No payout/settlement model.
- [ ] `MerchantKyc` model: PAN, GSTIN, Aadhaar (ref/last4), bank account + IFSC, business type, status state machine (UNSUBMITTED → PENDING → VERIFIED / REJECTED).
- [ ] Pluggable `KycProvider` adapter (stub now, like the payment adapters; real GSTN / NSDL-PAN / Aadhaar / bank penny-drop need live creds — same constraint as P0-1).
- [ ] Gate go-live / payouts on VERIFIED; verify against the existing `gstin`/`pan` fields.
- [ ] Surfaces: REST `/kyc`, MCP tools, admin onboarding step, platform-operator review queue, skill, tests.

### 3. Bootstrap / migration agent (Shopify, WooCommerce, Dukaan) — ✅ BUILT
`StoreImportService` + `migration/parsers.ts` import **products or customers**
from Shopify / WooCommerce / Dukaan CSV exports (and a generic CSV/JSON shape)
onto a store via the existing services. Idempotent + resumable (skip by
title/SKU/email), `dryRun` preview, per-row report (`ImportJob`). Surfaces: REST
`/imports`, MCP (`import_store`, `list_imports`, `get_import`), admin
**Import / Migrate** wizard, `acp-migration` skill, tests with fixtures.
- [x] (Follow-up) Live API ingestion — `import_store_api` / `runFromApi` pulls from Shopify Admin API + WooCommerce REST (injectable fetch; paginated).
- [x] (Follow-up) Historical **order** import — maps status, backdates, links lines to variants by SKU + customers by email, idempotent by source ref.
- [x] (Follow-up) **Inventory** import — SKU→quantity stock sheet updates existing variants (ledger movement); plus `updateExisting` to refresh price/stock on product re-import.

**Remaining priority:** eKYC (item 2) — as a stubbed-adapter slice (real
verification needs live GSTN/PAN/bank credentials, like P0-1 payments).

---

## Already shipped (for context)
- **Returns & cancellation policy** — ✅ first-class, enforced (`ReturnPolicy` + `ReturnService`); storefront-visible; refunds + GST credit notes.
- **GST invoicing & accounting (items 1–4)** — ✅ seller tax identity, HSN/GST on products, tax invoice on capture (CGST/SGST/IGST by place of supply), credit notes on refund (tax-inclusive), sales register CSV + P&L-lite. See `AUDIT.md`.
- **Legal pages** — ✅ Terms/Privacy/Shipping/Refund/Cookies generator + storefront pages (item 1 above).
- **Store migration/bootstrap agent** — ✅ Shopify/WooCommerce/Dukaan import (item 3 above).

## Known roadmap (from AUDIT.md)
- [ ] P0-1: real Razorpay / GoKwik / WhatsApp / Delhivery / Resend / Msg91 / ESP adapters (stubs today; need live credentials).
- [ ] Multi-location / warehouse inventory (large architectural change).
- [ ] Buyer accounts / order history / saved addresses (currently guest-only storefront).
- [ ] Outstanding **P2** hardening items — see `AUDIT.md` P2 section.
