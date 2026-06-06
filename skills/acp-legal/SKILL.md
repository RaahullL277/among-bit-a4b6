---
name: acp-legal
description: Use when the user wants legal/policy pages for their ACP store via the Claude connector — Terms of Use, Privacy Policy, Shipping Policy, Return/Refund Policy, or Cookie Policy — or wants buyers to accept them at checkout. Triggers on "terms of use", "terms and conditions", "privacy policy", "cookie policy", "shipping policy", "legal pages", "generate my policies", "add terms to my store", "publish privacy policy", "require terms acceptance", "consent at checkout". Drives generate_legal_policies, list_legal_policies, get_legal_policy, set_legal_policy, publish_legal_policy, list_legal_acceptances.
---

# Legal policies (Terms, Privacy, Shipping, Refund, Cookies)

Generate, edit and publish a store's legal/policy documents. Published policies appear in the storefront footer and on policy pages.

## Generate from templates (the fast path)
`generate_legal_policies` builds **India/GST-aware** drafts from the store's data:
- `storeId` + omit `type` → generate **all five** (Terms, Privacy, Shipping, Refund, Cookies).
- `storeId` + `type` → generate just one (`TERMS` | `PRIVACY` | `SHIPPING` | `REFUND` | `COOKIES`).
- `publish:true` → publish them on the storefront immediately (default leaves them as drafts to review).

The templates pull from:
- **Seller tax identity** (legal name, GSTIN, registered address) — set it via `set_store_tax_identity` first so the docs name the right entity.
- **Return policy** (window, restocking fee, cancellation window) — set via `set_return_policy` so the Refund/Shipping docs match what the system enforces.

## Review, edit, publish
- `list_legal_policies` — see all five with status + version.
- `get_legal_policy` — read one.
- `set_legal_policy` — replace the title/body with your own wording and/or set `status` (`DRAFT`/`PUBLISHED`). Editing the body bumps the version.
- `publish_legal_policy` — flip a policy `PUBLISHED`/`DRAFT` (controls footer visibility).

## Acceptance at checkout (implicit consent trail)
- Acceptance is **implicit**: placing an order agrees to the store's published policies — there is **no blocking checkbox**. The storefront shows a passive "By placing your order you agree to …" line linking the published policies.
- Each order automatically records an acceptance with the **exact policy versions in force**, the order, and the buyer email — view it with `list_legal_acceptances` (an auditable DPDP/consumer-protection trail). Editing a policy bumps its version, so future acceptances reference the new revision.
- The **only** opt-in checkbox at checkout is for **marketing** (optional, off by default) — see the `acp-marketing` / `acp-crm` flows. Buyers who don't opt in (or who unsubscribe) receive only order/delivery/return notices.

## Tips
- These are **starting templates, not legal advice** — every generated doc carries that disclaimer; advise the merchant to review with counsel.
- Set the seller tax identity + return policy **before** generating so the documents are accurate; re-generate to refresh after changing them.
- Only **published** policies are shown to buyers; drafts stay private to the merchant.
