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
- **Customer support chatbot** — a storefront sales & support assistant (Claude tool-use; stub
  fallback) that answers from the live catalog and verified order status, and escalates to a human.
  Backed by a merchant **support inbox** (read transcripts, reply as an agent, resolve) and per-store
  bot config. Public `/storefront/:id/support/*`; merchant `/support/*`.
- **Marketing-email connectors** — `MarketingEmailProvider` adapters for **Klaviyo / Mailchimp /
  Brevo (Sendinblue)** (stubbed), configured per store. Customers auto-sync on creation and a paid
  order tracks a "Placed Order" event; `/marketing/sync` re-syncs all customers. Real REST
  implementations slot in behind the same interface.
- **Customer reviews** — product star-ratings & written reviews (judge.me-style). Shoppers submit
  from the storefront; a review is **verified** when it matches a paid order for that product/email.
  Merchants moderate (approve/reject), post a public reply, and see per-status counts in a **Reviews**
  admin page. Approved reviews surface on product pages and as star summaries on listings; a
  `REVIEW_REQUEST` notification fires automatically on delivery. Public `/storefront/:id/.../reviews`
  + `/reviews/summary`; merchant `/reviews/*`.
- **Shipping** — create shipments via the active courier (Delhivery), AWB/label/tracking, signed
  tracking webhooks (`/webhooks/shipping/:provider`) that advance status and notify the customer at
  shipped / out-for-delivery / delivered milestones.
- **Platform operator console** — a *separate* cross-tenant auth plane (platform staff with
  SUPER_ADMIN / SUPPORT / BILLING / READ_ONLY roles, own magic-link login) for the company running
  the platform: a tenant/store directory, **suspend/reactivate** (which blocks the merchant's API
  keys, sessions, and storefront), **platform-wide analytics** (GMV, top merchants, growth),
  **plan/billing flags** (tier + store limit + feature flags, with the store limit enforced), an
  action audit log, and a **support chatbot** that answers operator questions over platform data.
  Distinct from per-merchant RBAC.

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

## MCP server — agentic usage

The repo ships `.mcp.json` so Claude Code auto-discovers the server. Build it and set your key:

```bash
pnpm --filter @acp/mcp build
export ACP_API_KEY=$(node -e "console.log(require('./.acp-seed.json').apiKey)")
```

Then in Claude Code you can say *"create a store called Spice Route and add a product"* and it will
call `create_store` / `create_product`. Available tools include `create_store`, `list_stores`,
`get_store`, `create_product`, `update_product`, `list_products`, `create_customer`, `list_orders`,
`get_order`, `update_order_status`, `checkout`, `configure_payment_provider`, `configure_whatsapp`,
`send_whatsapp_message`, and `create_api_key`.

The server also supports a Streamable-HTTP transport for remote/partner clients:
`MCP_TRANSPORT=http pnpm --filter @acp/mcp start` (per-request `Authorization: Bearer <key>`).

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
