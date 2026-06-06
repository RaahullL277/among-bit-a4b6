# Platform Audit — Exhaustive Prioritized Fix List

> **Status (this pass): all P0 and P1 FIXED, except P0-1 (real integrations) which was intentionally skipped (needs live credentials).**
> Fixed & shipped: P0-2 checkout delivery address · P0-3 tax & shipping · P1 order state machine · P1 variant edit surface · P1 refund cumulative cap + partial status · P1 subscription billing tenant-scope + idempotency · P1 shopability null-channel bypass · P1 support-escalation owner alert. Several P2s fixed along the way (compare-at validation, agent mandate vs. full total). Tests: 185 core / 11 api / 4 mcp green. Remaining work is **P2** (hardening/polish) and **P0-1 + multi-location** (roadmap).
>
> **Follow-up — GST invoicing & accounting (built):** seller tax identity on `Store` (GSTIN/legal name/registered address + invoice series), HSN + GST rate on products, auto-generated **GST tax invoice on payment capture** (seller + buyer snapshot, place of supply, per-line HSN + split CGST/SGST intra-state or IGST inter-state), **credit note on refund**, and a **sales register (CSV) + P&L-lite**. Returns now refund the **tax-inclusive** amount the buyer paid (their share of discount + GST, plus shipping on a full-order return), so a full return credits the exact order total and the credit note reverses the full invoiced GST. Surfaces: `InvoiceService`/`AccountingService`, REST `/invoices` + `/accounting`, MCP (`list_invoices`/`get_invoice`/`sales_register`/`profit_and_loss`/`set_store_tax_identity`), admin **Invoicing** page + buyer invoice download on the storefront Track page, and the `acp-invoicing` skill. Tests now **195 core / 11 api / 4 mcp** green.
>
> **Follow-up — legal pages & store migration (built):** (1) **Legal policies** — `LegalPolicy` model (Terms/Privacy/Shipping/Refund/Cookies), India/GST-aware template generator seeded from the seller tax identity + return policy, versioned, with REST `/legal`, MCP (`generate_legal_policies`/`set_legal_policy`/`publish_legal_policy`/…), an admin **Legal** page, storefront footer links + `/legal/:type` pages, and the `acp-legal` skill. (2) **Store migration/bootstrap agent** — `StoreImportService` imports products/customers from **Shopify / WooCommerce / Dukaan** CSV (and generic CSV/JSON), idempotent + `dryRun` preview + per-row report (`ImportJob`), with REST `/imports`, MCP `import_store`, an admin **Import / Migrate** wizard, and the `acp-migration` skill. Tests now **205 core / 11 api / 4 mcp** green.
>
> **Follow-up — migration & legal enhancements (built):** (1) **Live API ingestion** — `import_store_api` pulls from the Shopify Admin API + WooCommerce REST (paginated; injectable fetch for tests). (2) **Historical order import** — maps status, backdates the order date, links line items to variants by SKU + orders to customers by email, idempotent via `Order.sourceRef`. (3) **Inventory import** — a SKU→quantity stock sheet updates existing variants (stock-ledger movement); plus `updateExisting` to refresh price/stock on product re-import. (4) **Buyer legal-acceptance capture** — `LegalAcceptance` model records the policy versions in force per order/email; `list_legal_acceptances` exposes the trail. Tests now **211 core / 11 api / 4 mcp** green.
>
> **Follow-up — consent model corrected:** legal acceptance is now **implicit** (placing the order agrees to the published policies — passive notice, no blocking checkbox; the `requireLegalAcceptance` gate was removed). The **only** checkout checkbox is an **optional marketing opt-in, off by default**, which sets `marketingConsent`. Promotional sends (engagement campaigns, ESP sync) go only to opted-in customers; abandoned-cart recovery is suppressed for explicit unsubscribers; transactional notices (order/shipping/delivery/returns) always send. Tests **212 core / 11 api / 4 mcp** green.


_Method: four parallel feature-cluster audits (commerce core · fulfillment/post-purchase · customer/growth · platform/security) plus a cross-cutting sweep. **Every non-trivial finding was re-verified against the code before inclusion** — ~10 agent-reported "multi-tenant leaks" were dismissed as false positives (`storeId` is globally unique and internal methods are reached only after an ownership check). Severity below is re-graded by me, not the raw agent grades._

Legend: **P0** = blocks running a real store · **P1** = real bug / missing core capability · **P2** = hardening / polish.

---

## P0 — Go-live blockers (not bugs; required for real commerce)

| # | Area | Gap | Evidence |
|---|------|-----|----------|
| P0-1 | Integrations | **All payment/messaging/shipping/email/SMS/ESP adapters are stubs** returning fake ids. No real Razorpay/GoKwik/WhatsApp/Delhivery/Resend/Msg91/Klaviyo. | `packages/core/src/adapters/*` (intentional, known) |
| P0-2 | Checkout | **No delivery address is captured at checkout.** `Order` has no address; `cart`/`storefront` checkout never collects one. `Shipment.toAddress` is set merchant-side only — a real buyer can't say where to ship. | `schema.prisma model Order` (no address); `cart.service.checkoutCart`, `payment.service.checkout` |
| P0-3 | Checkout | **No tax or shipping-fee calculation.** Order total = item subtotal − discount; no GST/tax line, no shipping cost, no COD fee. | `payment.service.ts` checkout: `totalMinor = subtotalMinor - discountMinor` |

---

## P1 — Correctness & capability gaps (verified real)

### Orders & checkout
- **Unconstrained order status transitions** — `OrderService.updateStatus` does an unconditional `update({status})` with no state machine; PAID→PENDING, REFUNDED→PAID, etc. are all allowed, and the stock restore/release runs off `before.status` so illegal transitions can mis-handle inventory. `order.service.ts:32`
- **No variant edit surface** — `ProductService` can't update a variant's `priceMinor` / `compareAtMinor` / `title` / `sku` after creation (`UpdateProductInput` is product-level only; no REST/MCP). Merchants must delete & recreate a product to change its price. `product.service.ts` (UpdateProductInput), `products.controller.ts`
- **Refund has no cumulative cap** — `PaymentService.refund` checks each `amount ≤ order.totalMinor` but not the *sum* of prior refunds, and a partial refund leaves `payment.status = CAPTURED` (no `PARTIALLY_REFUNDED` state), so repeated partials can exceed the order total and the payment record can't represent a partial refund. `payment.service.ts:148-176`

### Subscriptions
- **`POST /subscriptions/run-billing` is a cross-tenant worker function exposed to merchants** — guarded only by `orders:write`, it calls `runDueSubscriptions()` which bills **every tenant's** due subscriptions (no `tenantId` scope). `subscriptions.controller.ts` + `subscription.service.ts:runDueSubscriptions`
- **Subscription billing isn't idempotent** — for each due sub it `checkout()`s then `update(nextBillingAt)`; a crash/concurrent re-run between the two re-bills the same period (no "already billed this cycle" guard). `subscription.service.ts:~271-310`

### Agent commerce
- **Shopability null-channel bypass** — `isShoppable` returns `ok:true` when the agent doesn't identify a channel, **even if that assistant's channel is disabled**. Disabling e.g. ChatGPT is sidestepped by any agent that omits `x-agent-channel`. `shopability.service.ts:isShoppable` (the `if (channel && !channels.has(channel))` only fires for *named* channels)

### Support
- **Escalations are invisible to the merchant** — `customer-support` flags a conversation `ESCALATED` but fires no owner notification, so escalated chats pile up unseen (broken support SLA). `customer-support.service.ts` (escalate path)

---

## P2 — Hardening, polish & edge cases (verified real)

### Commerce core
- `compareAtMinor` not validated to be `≥ priceMinor` → a merchant can create a struck-through "was" price *below* the real price (fake/negative discount). `product.service.ts`, `listing.service.ts`
- `cart.addItem` doesn't verify the variant belongs to the cart's store (checkout later rejects it, but the cart can hold cross-store items). `cart.service.ts:96`
- `StoreService.update` doesn't pre-check slug uniqueness → opaque DB unique-constraint error instead of a clean validation message. `store.service.ts:88`
- Pages can be published with **zero sections** (renders an empty storefront home). `page.service.ts:create`
- Product-grid sections fetch **all** active products with no limit → slow page render / large payload on big catalogs. `page.service.ts:resolveSections`
- Bundle discount value of `0` is accepted → "dead" bundles that apply no saving. `offer.service.ts:validateDiscount`
- Cart recovery & some best-effort flows swallow all errors (`.catch(()=>undefined)`) with no operator visibility into transient failures. `cart.service.ts:runRecoveryJobs`

### Fulfillment / post-purchase
- Subscription worker `take(500)` per run with no continuation — >500 due subs are delayed to the next tick. `subscription.service.ts`
- Shipping tracking webhook resolves the shipment by `awb + provider` only (no tenant) — two tenants sharing an AWB could cross-update (low probability; AWBs are courier-unique). `shipping.service.ts:handleTrackingWebhook`
- Order flips to `FULFILLED` on **shipment creation**, not on `DELIVERED` (debatable; inconsistent with the ShipmentStatus lifecycle). `shipping.service.ts`
- `return.cancel` is exposed via MCP but has no REST endpoint / admin button. `returns.controller.ts`

### Customer / growth
- `engagement.setCampaign` accepts a non-existent `cohortKey` silently → the campaign targets an empty audience with no warning. `engagement.service.ts:setCampaign`
- Notifications to a store owner **silently skip** when `ownerEmail`/`ownerPhone` are null — the merchant never learns they're unreachable. `notification.service.ts:resolveAddress`
- Public review submission is gated only by the IP rate-limiter (no order-verification requirement to *create* a review; moderation catches it later) → review-spam vector. `review.service.ts:submit`
- Storefront page `section.data` JSON is stored verbatim with no schema validation → runtime render errors when the UI meets an invalid section config. `page.service.ts`
- Listing content stub can emit degenerate copy ("New product · New product") when neither `hint` nor `categoryHint` is set. `listing.service.ts:composeTitle/Bullets`
- No `image.test.ts` / `support-assistant` test; missing-alt is reported but never enforced/reminded. `image.service.ts`

### Platform / security (defense-in-depth)
- **Credential rotation** — integration credentials are AES-256-GCM encrypted at rest (good) but there's no key-versioning / re-encrypt path; a `CORE_ENCRYPTION_KEY` leak compromises all stored creds until manual reconfigure. `integration.service.ts`
- **Customer/email enumeration** — `optIn`/`unsubscribe` (and similar) return `{found}`/`{unsubscribed: count>0}`, revealing whether an email exists; magic-link `requestLink` is a timing oracle (fast for unknown emails). Make responses constant-shape/constant-time. `customer.service.ts`, `auth/platform-auth/partner-auth.service.ts`
- **Public `body: any` endpoints** (`/storefront/:id/track`, support chat, etc.) have no input schema/size validation → memory/storage DoS via oversized payloads. `storefront.controller.ts`
- **Tenant suspension doesn't invalidate** pending invites or magic-link tokens → a suspended tenant's invitees can still join. `platform.service.ts:setTenantStatus`
- Storefront `searchProducts` filters by `storeId` only (safe today since storeId is unique, but add `tenantId` for defense-in-depth). `storefront.service.ts:78`
- Merchant session TTL is **30 days** vs 12h for operator/partner — large compromise window; consider 7 days. `auth.service.ts`
- Platform audit log records the new value but not the **before** state (weak forensics); merchant audit log records `actorKind:'apiKey'` without the key prefix. `platform.service.ts`, `audit.interceptor.ts`
- Long-lived tokens use `randomBytes(24)` (192-bit — cryptographically strong; bump to 32B only as a nicety). `crypto.ts`

---

## Dismissed as false positives (investigated, not real)
- **All ~10 agent-reported "multi-tenant leaks"** in `customer.optIn/unsubscribe`, `cohort.features/recommendations`, `listing.setConfig`, `returns.list`, `loyalty.publicBalance` — each is scoped by `tenantId` and/or by the globally-unique `storeId`, and internal methods run only after an upstream ownership check. **No cross-tenant access exists.**
- **Review author email exposure** — `listForProduct` returns `authorName`, not email.
- **"Missing @Permissions" on api-keys/members/messaging/partner controllers** — all use **class-level** `@Permissions`/`@UseGuards` (the line-scan missed them). RBAC is intact.
- **CSRF** — the API is Bearer-token (Authorization header), inherently CSRF-safe.
- **Webhook signature "optional"** — payment webhooks verify the signature with the store's secret after resolving by `providerRef`; unrouted events are logged, not processed.
- **Refund-from-APPROVED skips restock** — intended: refund-without-physical-return correctly does not restock.

---

## Known / intentional (roadmap, not bugs)
- Adapter stubs (P0-1) — by design until real credentials.
- Multi-location / warehouse inventory — deferred (large architectural change).
- Guest-only storefront (no buyer accounts / order history / saved addresses) — product-depth item.
- Listing content/photo generation is a deterministic stub with a clean seam for a real model.

---

### Tally (verified): **3 P0 · 9 P1 · ~24 P2**. RBAC, multi-tenant isolation, credential encryption, audit logging, partner delegation, rate limiting, and the agent payment-mandate are all sound. The biggest real gaps are product-completeness (address + tax/shipping + real integrations) and a handful of correctness guardrails (order state machine, variant editing, subscription billing safety, shopability channel enforcement).
