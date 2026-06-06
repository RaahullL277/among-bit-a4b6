---
name: acp-bundles
description: Use when the user wants to set up product bundles, "frequently bought together", or "buy together and save" offers on their ACP store via the Claude connector. Triggers on "create a bundle", "frequently bought together", "bundle discount", "buy together and save". Drives create_bundle and list_bundles.
---

# Bundles / frequently bought together

A bundle is a set of variants sold together at a saving; the discount **auto-applies at checkout** when a cart holds all the items, and the bundle shows on each member product's page.

## Steps
1. `list_products` (for the `storeId`) to get the `variantId`s you want to bundle.
2. `create_bundle` with:
   - `storeId`, `title`, optional `description`
   - `discountType` `PERCENT` or `FIXED`, `discountValue` (percent, or minor units)
   - `items`: `[{ variantId, quantity? }]` — at least two
3. Confirm with `list_bundles` (shows the priced bundle + savings).

## Tips
- Bundles need ≥ 2 items; a percent discount can't exceed 100.
- The storefront also shows an automatic "frequently bought together" list mined from paid-order co-purchases when no curated bundle applies — no setup needed.
