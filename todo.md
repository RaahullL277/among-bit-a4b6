# TODO — Roadmap & Backlog

Pending build items, grounded in the codebase. Each maps to the standard
agentic-first pattern: **core service → REST + MCP tool → admin/storefront UI →
SKILL.md → tests**. Severity tags follow `AUDIT.md` (P0 = go-live blocker · P1 =
core capability gap · P2 = polish).

---

## Compliance, onboarding & migration (investigated 2026-06-06)

### 1. Legal pages — Terms of Use & Privacy Policy — ❌ not built (P1)
No legal-document model, generator, default templates, acceptance/consent
tracking, or checkout/footer linkage exists today (`termsOfService` /
`privacyPolicy` / `legalPage` return nothing). A merchant can only hand-author a
page via the generic page builder (`StorePage` `rich_text`/`faq`), which is
unmanaged free text and not linked anywhere by default.
- [ ] `LegalPolicy` model (type: TERMS / PRIVACY / SHIPPING / REFUND / COOKIES), per store, versioned.
- [ ] India/GST-aware default templates + a generator (seed from store + seller tax identity).
- [ ] Auto-link in the storefront footer + checkout; optional buyer-acceptance capture (timestamp/version).
- [ ] Surfaces: REST `/legal`, MCP (`set_legal_policy`, `get_legal_policy`, `generate_legal_policy`), admin page, storefront pages, `acp-legal` skill, tests.
- Pattern reference: `ReturnPolicy` (`return.service.ts`) is the proven first-class-policy template.

### 2. eKYC / merchant verification & payouts — ❌ not built (P0 for real go-live)
Entirely absent — no `kyc` / `aadhaar` / `bankAccount` / `payout` / `ifsc` /
business-verification anywhere. `Store.gstin` / `Store.pan` exist **only as
invoice print identity** and are never verified. No payout/settlement model.
- [ ] `MerchantKyc` model: PAN, GSTIN, Aadhaar (ref/last4), bank account + IFSC, business type, status state machine (UNSUBMITTED → PENDING → VERIFIED / REJECTED).
- [ ] Pluggable `KycProvider` adapter (stub now, like the payment adapters; real GSTN / NSDL-PAN / Aadhaar / bank penny-drop need live creds — same constraint as P0-1).
- [ ] Gate go-live / payouts on VERIFIED; verify against the existing `gstin`/`pan` fields.
- [ ] Surfaces: REST `/kyc`, MCP tools, admin onboarding step, platform-operator review queue, skill, tests.

### 3. Bootstrap / migration agent (Shopify, WooCommerce, Dukaan) — ❌ not built (P1)
No importers, CSV/bulk import, or migration tooling. `OnboardingService` only
provisions a fresh store with inline products. The only related artifact is a
**stub** "Review Importer" marketplace catalog entry (`app.service.ts`, metadata
only, no runtime).
- [ ] `StoreImportService` with per-source adapters: Shopify (CSV + Admin API), WooCommerce (REST), Dukaan (export).
- [ ] Map imported products / variants / customers / orders onto existing `products.create` / `customers.create` / order creation; idempotent, resumable, with an import report (created/skipped/failed).
- [ ] MCP `import_store` tool so an agent can drive "move my Shopify store over" conversationally; admin "Import" wizard; `acp-migration` skill; tests with sample fixtures.
- [ ] Decide credential handling (file upload / CSV vs API keys) per source.

**Suggested order:** migration agent + legal pages first (high activation, no
external credentials needed); eKYC as a stubbed-adapter slice (real verification
needs live GSTN/PAN/bank credentials, like P0-1 payments).

---

## Already shipped (for context)
- **Returns & cancellation policy** — ✅ first-class, enforced (`ReturnPolicy` + `ReturnService`); storefront-visible; refunds + GST credit notes.
- **GST invoicing & accounting (items 1–4)** — ✅ seller tax identity, HSN/GST on products, tax invoice on capture (CGST/SGST/IGST by place of supply), credit notes on refund (tax-inclusive), sales register CSV + P&L-lite. See `AUDIT.md`.

## Known roadmap (from AUDIT.md)
- [ ] P0-1: real Razorpay / GoKwik / WhatsApp / Delhivery / Resend / Msg91 / ESP adapters (stubs today; need live credentials).
- [ ] Multi-location / warehouse inventory (large architectural change).
- [ ] Buyer accounts / order history / saved addresses (currently guest-only storefront).
- [ ] Outstanding **P2** hardening items — see `AUDIT.md` P2 section.
