---
name: acp-partner
description: Use when the user is a partner / agency / reseller who wants to view their dashboard or build and manage client stores on the agentic commerce platform (ACP) via the Claude connector. Triggers on "show my partner dashboard", "manage my client's store", "build a store for my client", "my clients' earnings". Drives partner_dashboard, list_clients, use_client, create_client, update_client_plan.
---

# Partner: manage & build for clients

These tools appear only when the connector is authenticated with a **partner token** (`pts_…`).

## Dashboard
`partner_dashboard` → client GMV, your commission earnings, recurring MRR, and upcoming renewals.

## Build/manage a client's store
1. `list_clients` → each client's `tenantId`, GMV, your earnings, and your **access level** (`MANAGE` / `VIEW` / `NONE`, set by the client).
2. `use_client` with the chosen `tenantId`. Subsequent tools act on that client's store.
3. Now apply any setup skill (launch-store, loyalty, bundles, pricing, …) — it operates on the active client, subject to your access level.

## Onboard & bill clients
- `create_client` with `businessName` + `ownerEmail` (and optional `monthlyFeeMinor`, `renewsAt`) spins up a fresh client store workspace linked to you with full (MANAGE) access, and returns an owner email (magic-link login) + API key to hand to the client.
- `update_client_plan` with `clientId` + `monthlyFeeMinor` / `renewsAt` edits a client's recurring plan.

## Tips
- You can only modify a client's store when they've granted `MANAGE`; `VIEW` is read-only; `NONE` blocks store access. The client controls this and can revoke it any time.
- A partner cannot change its own access level.
