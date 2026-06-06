---
name: acp-migration
description: Use when the user wants to move/import/migrate an existing store onto the ACP platform via the Claude connector — bring products, customers, historical orders, or inventory over from Shopify, WooCommerce, or Dukaan (by pasting an export or connecting the source store's API). Triggers on "import my store", "migrate from Shopify", "move my WooCommerce products", "Dukaan export", "import products CSV", "import my orders", "sync my inventory", "connect my Shopify", "bring my catalog over", "bootstrap my store from my old one". Drives import_store, import_store_api, list_imports, get_import.
---

# Store migration / bootstrap agent

Move a merchant's **products, customers, historical orders, or inventory** from an existing store onto their ACP store — either by pasting an export file or by pulling live from the source store's API.

## Two ways in
**A. Paste an export — `import_store`** (no credentials needed):
- `data` = the raw export contents (CSV text or JSON).
- `source` = `SHOPIFY` | `WOOCOMMERCE` | `DUKAAN` | `GENERIC`.

**B. Connect the live API — `import_store_api`** (pulls directly):
- `credentials` — Shopify: `{ shop, accessToken }`; WooCommerce: `{ url, consumerKey, consumerSecret }`.
- `source` = `SHOPIFY` | `WOOCOMMERCE`.

Both share these parameters:
- `storeId` — target store (create one first if needed).
- `kind` — `products` (default) · `customers` · `orders` · `inventory` (file-only; a SKU+quantity stock sheet).
- `dryRun` — preview the parse + counts without writing. **Always preview first.**
- `updateExisting` — for products, refresh price & stock on items already present (matched by SKU) instead of skipping.

## What each kind does
- **products** — creates products + variants (prices→paise, compare-at, inventory). Skips by title/SKU (or updates with `updateExisting`).
- **customers** — creates customers (name/email/phone). Skips by email.
- **orders** — imports historical orders as records (no re-charge): maps status, backdates the order date, links line items to existing variants by SKU and to customers by email. Skips by source reference (idempotent).
- **inventory** — updates stock on existing variants matched by SKU (records a stock-ledger movement).

## Steps
1. Ensure a target store exists.
2. `dryRun:true` to preview parse + per-row outcomes.
3. Run for real; check the returned `ImportJob` (`productsCreated/Skipped`, `customersCreated/Skipped`, `failed`, per-row `report`).
4. `list_imports` / `get_import` review past runs.

## Tips
- Re-running is always safe — existing products (title/SKU), customers (email), and orders (source ref) are skipped.
- A sensible order: products → inventory → customers → orders (so order lines can link to variants/customers).
- Imported products land with their source status; set HSN/GST (`update_product`) and review pricing before going live.
- Prices in CSVs are major units (`249.00` → ₹249.00); JSON may use `priceMinor` directly.
- API import paginates and runs synchronously; very large catalogs are capped per run — re-run to continue (idempotent).
