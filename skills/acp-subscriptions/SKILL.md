---
name: acp-subscriptions
description: Use when the user wants to set up subscriptions, recurring orders, or a "subscribe & save" offer (Recharge-style) on their ACP store via the Claude connector. Triggers on "set up subscriptions", "subscribe and save", "recurring orders", "monthly box". Drives set_subscription_settings, create_subscription, list_subscriptions.
---

# Subscriptions ("subscribe & save")

## Set up the storefront offer
Call `set_subscription_settings` with:
- `storeId`, `enabled: true`
- `discountPercent` — the subscribe & save discount
- `intervals` — which cadences shoppers can pick (`WEEKLY`, `BIWEEKLY`, `MONTHLY`, `QUARTERLY`)

Shoppers then choose "Subscribe & save" on the product page. The background worker generates a discounted order each due date and advances the schedule.

## Manage subscriptions
- `list_subscriptions` (optionally by `status`).
- `create_subscription` to set one up directly: `storeId`, `variantId`, `interval`, `email` (or `customerId`), optional `quantity`, `discountPercent`.
- `update_subscription_status` to `ACTIVE` / `PAUSED` / `CANCELLED`.

## Tips
- Recurring billing runs through the store's payment provider (configure it first — see **acp-payments**).
- Customers self-manage (pause/resume/cancel) by email on the storefront `/subscriptions` page.
