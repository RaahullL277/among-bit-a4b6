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
frontend/       Merchant admin console (React + Vite + Tailwind) over the REST API
```

- **Multi-tenant:** every row carries a `tenantId`; the service layer scopes all queries by the
  authenticating API key's tenant. Cross-tenant access is covered by an isolation test.
- **Auth:** API keys (SHA-256 hashed at rest) scope a tenant and authenticate **both** REST and MCP.
- **Adapters:** `PaymentProvider` (Razorpay, GoKwik) and `MessagingProvider` (WhatsApp) are
  resolved per-store from encrypted `IntegrationConfig`. v1 ships deterministic **stubs** (no
  network) that keep the exact interface — including HMAC webhook verification — so real providers
  drop in later with no call-site changes.

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
```

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

## Roadmap (beyond Milestone 1)

Buyer storefront + cart · real Razorpay/GoKwik/WhatsApp credentials · partner app marketplace
runtime & billing · shipping/logistics · richer analytics · merchant auth (email/password/SSO)
in front of API keys. Each builds on the single `@acp/core` service layer established here.
