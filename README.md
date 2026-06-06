# Agentic Commerce Platform (India) — Milestone 1

An **agentic-first**, multi-tenant e-commerce platform for India (Shopify/Dukaan-class),
with **Razorpay**, **GoKwik**, and **WhatsApp** integrations built as pluggable adapters.

The defining idea: **one service layer, two transports.** Every store operation lives in
`@acp/core` and is exposed identically through a **REST API** (for dashboards/humans) and an
**MCP server** (for Claude and other agents). Building a store conversationally and building it
through the API are the same code path.

> **Milestone 1 scope:** the agentic core — domain model, REST API, MCP server, and stubbed
> provider adapters. Storefront UI, real payment/WhatsApp credentials, and the partner app
> marketplace are roadmapped (see the bottom of this file).

## Architecture

```
packages/core   Prisma schema + domain services + provider adapters (the single source of truth)
apps/api        NestJS REST API   ─┐
apps/mcp        MCP server         ├─ thin transports, both call @acp/core
apps/worker     Background jobs (abandoned-cart recovery, stock recompute/alerts)
frontend/       Merchant admin console (React + Vite + Tailwind) over the REST API
storefront/     Public buyer storefront (browse → cart → checkout) over the public API
platform/       Platform-operator console (cross-tenant back-office) over /platform/*
partner/        Partner/agency portal (client analytics + earnings) over /partner/*
```

- **Multi-tenant:** every row carries a `tenantId`; the service layer scopes all queries by the
  authenticating tenant. Cross-tenant access is covered by an isolation test.
- **Auth & RBAC:** two credential types resolve to one `TenantContext` — **API keys** (`sk_…`,
  hashed, full permissions for agents/partners) and **user sessions** (`ses_…`, passwordless
  magic-link login). Roles (OWNER/ADMIN/STAFF) gate every route via `@Permissions`.
- **Adapters:** `PaymentProvider` (Razorpay, GoKwik), `MessagingProvider` (WhatsApp),
  `EmailProvider` (Resend), `SmsProvider` (MSG91) and `ShippingProvider` (Delhivery) are resolved
  per-store from encrypted `IntegrationConfig`. v1 ships deterministic **stubs** (no network) that
  keep the exact interface — including HMAC webhook verification — so real providers drop in later
  with no call-site changes.

### Capabilities beyond the core

- **Notifications** — multi-channel (email/SMS/WhatsApp) to customers and store owners, with
  per-event channel preferences and a delivery audit log; wired to order events.
- **Users, roles & invites** — passwordless login, team management, and RBAC across REST + MCP.
- **Abandoned-cart recovery** — carts, checkout-from-cart, and a configurable recovery sequence
  sent via notifications (driven by `apps/worker`).
- **Stock health 🔴🟠🟢** — a pluggable, ML-ready scorer (sales-velocity → days-of-cover) with
  per-store thresholds and low/out-of-stock alerts to owners.
- **Analytics** — KPI summary (revenue/AOV/conversion), revenue time-series, the
  cart→checkout→paid funnel, and top products over a date range, behind `/analytics/*` and the
  merchant dashboard.
- **Customers & CRM** — a 360° customer profile (lifetime value, orders, AOV, loyalty tier/points,
  active subscriptions, reviews, returns, support) with **tags & notes**, **search**, and heuristic
  **RFM-style segments** (NEW / ONE_TIME / REPEAT / VIP / AT_RISK / LAPSED) plus a store summary
  (repeat rate, avg LTV, segment breakdown). Customers are auto-created at checkout and synced to the
  connected ESP. Merchant **Customers** list + **customer detail** page; `/customers/*`; MCP
  `list_customers` / `get_customer_profile` / `update_customer` / `customer_summary`.
- **Customer support chatbot** — a storefront sales & support assistant (Claude tool-use; stub
  fallback) that answers from the live catalog and verified order status, and escalates to a human.
  Backed by a merchant **support inbox** (read transcripts, reply as an agent, resolve) and per-store
  bot config. Public `/storefront/:id/support/*`; merchant `/support/*`.
- **Marketing-email connectors** — `MarketingEmailProvider` adapters for **Klaviyo / Mailchimp /
  Brevo (Sendinblue)** (stubbed), configured per store. Customers auto-sync on creation and a paid
  order tracks a "Placed Order" event; `/marketing/sync` re-syncs all customers. Real REST
  implementations slot in behind the same interface.
- **Store design & page builder** — merchant- (or agent-) authored storefront pages built from typed
  sections (hero, rich text, image, product grid, featured product, FAQ) stored as JSON, plus a
  per-store **theme** (brand/accent colors + logo). The storefront renders the published `home` page
  (falling back to the catalog grid) with product references resolved server-side; drafts stay hidden
  until published. Merchants use a **Design** builder (add/reorder/edit sections, SEO, publish);
  the same `PageService` powers MCP tools (`list_pages` / `create_page` / `update_page` /
  `publish_page` / `set_store_theme`) so an agent can design a store. Public
  `/storefront/:id/pages/:slug` + `/theme`; merchant `/pages/*` + `/theme`.
- **Bundles & "frequently bought together"** — curated *buy-together-and-save* bundles (percent or
  fixed discount) whose saving **auto-applies at checkout** when a cart holds all the items (no coupon
  codes; the discount is recorded on the order). Product pages show the bundle, or fall back to an
  automatic frequently-bought-together list mined from paid-order co-purchases. Merchants build and
  toggle bundles from a **Bundles** admin page (with co-purchase suggestions). Public
  `/storefront/:id/products/:pid/bundles` + `/frequently-bought-together`; merchant `/bundles/*`;
  MCP `list_bundles` / `create_bundle`.
- **Pricing intelligence** — tracks **competitor prices** per variant, computes **margin** (off a unit
  cost) and **market position** (cheapest / competitive / expensive), and recommends a price from a
  store **repricing rule** (match-lowest / beat-lowest / fixed-margin) that is **always bounded by a
  minimum-margin floor** so a price war can't sell at a loss. Merchants set costs, add competitors,
  tune the rule, and preview or apply repricing (which writes the new variant prices) from a
  **Pricing** admin page; charm (.99) rounding optional. Merchant `/pricing/*`; MCP `analyze_pricing`
  / `run_repricing` / `add_competitor_price`.
- **SEO & page speed** — an SEO audit engine (Plug-in-SEO style) scores the live catalog + pages and
  lists on-page issues (missing/over-long meta, missing alt text, no images), renders per-product
  **meta tags + Product JSON-LD** (price/availability/aggregate rating) and applies them on the
  storefront, and serves **sitemap.xml** + **robots.txt**. Paired with **image optimization**
  (TinyIMG style): a per-store image registry with one-click/bulk **compression** (recorded byte
  savings), **alt-text generation**, and a savings + page-speed score. Products gain SEO meta
  overrides. Public `/storefront/:id/sitemap.xml` + `/robots.txt` + `/products/:pid/seo`; merchant
  `/seo/*` + `/images/*`; MCP `seo_audit` / `optimize_images`.
- **Subscriptions** — "subscribe & save" recurring orders (Recharge/LoyaltyLion-style). Shoppers
  subscribe to a product at a chosen cadence (weekly → quarterly) from the product page at a merchant-
  set discount; the **background worker generates a discounted order on each due date** and advances
  the schedule. Customers self-manage (pause / resume / cancel) by email; merchants configure the
  storefront offer, view/manage all subscriptions, and can trigger billing on demand. Public
  `/storefront/:id/subscription-settings` + `/subscriptions`; merchant `/subscriptions/*`; MCP
  `list_subscriptions` / `create_subscription` / `update_subscription_status`.
- **Loyalty & rewards** — a per-store points program (LoyaltyLion-style): points are **earned
  automatically on paid orders**, **lifetime points drive tiers**, and customers **redeem points for a
  checkout discount** (capped at the order value, combinable with bundle savings). A signed points
  ledger is the source of truth. Merchants configure the program (earn rate, redemption value,
  minimum, signup bonus, tiers) and view/adjust member balances on a **Loyalty** admin page;
  shoppers check their balance and redeem from the cart. Public `/storefront/:id/loyalty`; merchant
  `/loyalty/*`; MCP `get_loyalty_program` / `set_loyalty_program` / `adjust_loyalty_points`.
- **Customer reviews** — product star-ratings & written reviews (judge.me-style). Shoppers submit
  from the storefront; a review is **verified** when it matches a paid order for that product/email.
  Merchants moderate (approve/reject), post a public reply, and see per-status counts in a **Reviews**
  admin page. Approved reviews surface on product pages and as star summaries on listings; a
  `REVIEW_REQUEST` notification fires automatically on delivery. Public `/storefront/:id/.../reviews`
  + `/reviews/summary`; merchant `/reviews/*`.
- **Shipping** — create shipments via the active courier (Delhivery), AWB/label/tracking, signed
  tracking webhooks (`/webhooks/shipping/:provider`) that advance status and notify the customer at
  shipped / out-for-delivery / delivered milestones. Shipments can be **insured** and carry a
  **packed-order video** (dispute evidence, QuickBooks-style).
- **Returns / RMA** — customers raise a return against a paid order from the storefront (verified by
  order number + email, optionally with an **unboxing/damage video** as evidence); merchants
  approve/reject, mark the item received, and issue a **refund through the payment adapter** (full or
  partial). A guarded status machine (REQUESTED→APPROVED→RECEIVED→REFUNDED, or REJECTED/CANCELLED)
  drives notifications at each step, and a full refund flips the order + payment to REFUNDED. Public
  `/storefront/:id/order-lookup` + `/returns`; merchant `/returns/*`; MCP `list_returns` /
  `update_return`.
- **Platform operator console** — a *separate* cross-tenant auth plane (platform staff with
  SUPER_ADMIN / SUPPORT / BILLING / READ_ONLY roles, own magic-link login) for the company running
  the platform: a tenant/store directory, **suspend/reactivate** (which blocks the merchant's API
  keys, sessions, and storefront), **platform-wide analytics** (GMV, top merchants, growth),
  **plan/billing flags** (tier + store limit + feature flags, with the store limit enforced), an
  action audit log, and a **support chatbot** that answers operator questions over platform data.
  Distinct from per-merchant RBAC.
- **Partner / agency portal** — a *third* auth plane (partners log in via magic link) where an
  agency sees a dashboard across **only its own client stores**: aggregate GMV + orders, **commission
  earnings** (a configurable % of client GMV), recurring **MRR**, and **upcoming renewals**, plus
  per-client breakdowns. Operators provision partners and assign client tenants (with a monthly fee +
  renewal date) from the platform console. Partner endpoints `/partner/*`; operator management under
  `/platform/partners`. A partner can also **manage a client's store** (every merchant feature — add /
  edit / delete) by deep-linking into the merchant console; this is **governed by the client**, who
  sets a per-partner access level (**MANAGE / VIEW / NONE**) from Settings and can revoke it any time.
  Delegation flows through the normal tenant guard (partner token + `x-acp-client` header → permissions
  scoped to the access level); a partner can never change its own access.

## Prerequisites

- Node ≥ 20, pnpm
- PostgreSQL 16 — either `docker compose up -d` (uses `docker-compose.yml`) or a local cluster
  reachable at the `DATABASE_URL` below.

## Quickstart

```bash
# 1. Install
pnpm install

# 2. Configure env
cp .env.example .env
# Generate an encryption key and paste it into CORE_ENCRYPTION_KEY:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 3. Start Postgres (Docker), or point DATABASE_URL at an existing cluster
pnpm db:up

# 4. Migrate + seed (creates a demo merchant, store, products, API key)
pnpm prisma:migrate
pnpm seed     # prints an API key and writes .acp-seed.json (gitignored)

# 5a. Run the REST API
pnpm api:dev          # http://localhost:3000

# 5b. Run the MCP server (stdio for Claude Code, or HTTP)
pnpm mcp:dev

# 5c. Run the background worker (cart recovery + stock alerts)
pnpm worker:dev

# 5d. Run the buyer storefront (public; set its store via VITE_STORE_ID or ?store=<id>)
pnpm store:dev        # http://localhost:5174

# 5e. Run the platform-operator console (sign in as the seeded platform admin)
pnpm platform:dev     # http://localhost:5175

# 5f. Run the partner/agency portal (sign in as the seeded partner)
pnpm partner:dev      # http://localhost:5176
```

The **storefront** is unauthenticated and store-scoped: a public API surface (`/storefront/*`,
keyed by store id and opaque cart id) exposes only the active catalog, carts, and checkout, while
every admin route still requires a key or session. Checkout runs through the active payment
provider (the Razorpay **stub** today) and produces a pending order.

## REST API — example flow

The seed prints an API key (also in `.acp-seed.json`). All routes except `/health` and
`/webhooks/*` require it via `x-api-key` (or `Authorization: Bearer`).

```bash
KEY=$(node -e "console.log(require('./.acp-seed.json').apiKey)")
STORE=$(node -e "console.log(require('./.acp-seed.json').storeId)")
VARIANT=$(node -e "console.log(require('./.acp-seed.json').sampleVariantId)")

# Create an order + payment via the store's active payment provider (stub)
curl -s -H "x-api-key: $KEY" -H 'content-type: application/json' \
  -X POST http://localhost:3000/payments/checkout \
  -d "{\"storeId\":\"$STORE\",\"items\":[{\"variantId\":\"$VARIANT\",\"quantity\":2}]}"

# Simulate a signed provider webhook (HMAC over the body with the integration's webhookSecret)
# -> order transitions to PAID. See apps/api/test/e2e.test.ts for the full scripted flow.
```

Key endpoints: `POST /stores`, `GET /stores`, `POST /products`, `GET /products?storeId=`,
`POST /payments/checkout`, `POST /webhooks/:provider`, `POST /messaging/send`,
`POST /integrations`, `POST /api-keys`, `PATCH /orders/:id/status`.

## MCP connector — build & launch a store with Claude

The MCP server is a **connector**: add it to Claude (Desktop/Code/web) and anyone can build and launch
a store conversationally. The repo ships `.mcp.json` so Claude Code auto-discovers it; build it once:

```bash
pnpm --filter @acp/mcp build
```

The connector credential (`ACP_CREDENTIAL`, or `ACP_API_KEY` / `ACP_PARTNER_TOKEN`) decides the mode —
**it's optional**:

- **New user (no credential)** — onboarding mode. The agent calls `create_account` (creates a workspace
  + returns an API key) and can then `launch_store` in the same session. Say *"sign me up and launch a
  tea store with three products"* and it stands up a live storefront.
- **Merchant (`sk_…` API key)** — manage an existing store: every catalog/order/marketing/pricing tool
  is available.
- **Partner (`pts_…` token)** — agency mode. `list_clients` → `use_client(tenantId)` to pick a client,
  then build/manage **that client's** store (subject to the MANAGE/VIEW access the client granted).
  `partner_dashboard` shows GMV, earnings, and renewals.

The headline tool is **`launch_store`** — one call creates the store, configures a (stubbed) payment
provider, adds active products, applies a theme, and publishes a storefront home page, returning the
**live storefront URL**. `whoami` explains the current session and what to do next.

```bash
# Onboard a brand-new store with no credential set:
unset ACP_CREDENTIAL && pnpm --filter @acp/mcp build
# …then in Claude: "Create an account for hello@acme.com and launch a store called Acme with 2 products."

# Or manage the seeded demo store:
export ACP_CREDENTIAL=$(node -e "console.log(require('./.acp-seed.json').apiKey)")
```

All tools are thin wrappers over the same `@acp/core` services the REST API and dashboards use, so the
agent and a human get identical behavior. The server also supports a Streamable-HTTP transport for
remote clients: `MCP_TRANSPORT=http pnpm --filter @acp/mcp start` (per-request `Authorization: Bearer
<credential>`).

## Merchant admin console (`frontend/`)

A React + Vite + Tailwind dashboard over the REST API. Sign in by pasting a merchant API key
(stored in `localStorage`); it's validated against the API. Features: dashboard stats + orders
chart, store/product/customer management, an order list with inline status updates, per-store
integration setup (Razorpay / GoKwik / WhatsApp), and API-key management.

```bash
# The API must be running with CORS allowing the dev origin (enabled by default).
pnpm api:dev                      # http://localhost:3000
pnpm admin:dev                    # http://localhost:5173
# Point the UI elsewhere with VITE_API_URL (see frontend/.env.example).
```

CORS origins are configurable on the API via `CORS_ORIGIN` (comma-separated; defaults to allow-all
in dev).

## Tests

```bash
# Pure unit tests run without a DB; DB-backed tests auto-skip unless DATABASE_URL is set.
set -a; . ./.env; set +a
pnpm test
```

Coverage: credential encryption + API-key hashing, adapter stubs (incl. webhook HMAC),
multi-tenant isolation, the REST checkout→webhook→PAID flow, and an MCP tool smoke test.

## Roadmap

Buyer storefront UI · real Razorpay/GoKwik/WhatsApp/Resend/MSG91 credentials · Google SSO ·
tenant-level email delivery for auth links · ML demand-forecasting scorer (drop-in for the
heuristic) · partner app marketplace runtime & billing · shipping/logistics · richer analytics.
Each builds on the single `@acp/core` service layer established here.
