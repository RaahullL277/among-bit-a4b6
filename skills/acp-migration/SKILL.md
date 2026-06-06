---
name: acp-migration
description: Use when the user wants to move/import/migrate an existing store onto the ACP platform via the Claude connector — bring products or customers over from Shopify, WooCommerce, or Dukaan (or a generic CSV/JSON). Triggers on "import my store", "migrate from Shopify", "move my WooCommerce products", "Dukaan export", "import products CSV", "bring my catalog over", "bootstrap my store from my old one". Drives import_store, list_imports, get_import.
---

# Store migration / bootstrap agent

Move a merchant's catalog or customer list from an existing store onto their ACP store. The merchant exports a CSV (or JSON) from their current platform; you import it.

## Steps
1. Make sure there's a target store (`create_store` / `launch_store` if needed).
2. Ask the merchant to export from their current platform and paste the file contents:
   - **Shopify** → Products CSV export (or Customers CSV).
   - **WooCommerce** → Products CSV export (WooCommerce → Products → Export).
   - **Dukaan** → product export CSV.
   - **Generic** → any CSV with `title,price,sku,inventory,description,status`, or JSON in the platform's own shape (`[{ title, priceMinor, inventory, variants:[...] }]`).
3. **Preview first:** call `import_store` with `dryRun:true` to parse and report counts + per-row outcomes without writing.
4. **Import:** call `import_store` (no dryRun) to create the records.

## `import_store` parameters
- `storeId` — target store.
- `source` — `SHOPIFY` | `WOOCOMMERCE` | `DUKAAN` | `GENERIC`.
- `kind` — `products` (default) or `customers`.
- `data` — the raw export contents (CSV text or JSON).
- `dryRun` — preview only.

## What it does
- Parses the export into normalized products (with variants, prices in paise, compare-at, inventory) or customers (name/email/phone).
- Creates them via the same services as manual entry, so everything (storefront, stock, invoicing) works immediately.
- **Idempotent + resumable:** products already present (by title or SKU) and customers (by email) are **skipped**, so re-running after a partial import is safe.
- Returns an `ImportJob` with `productsCreated/Skipped`, `customersCreated/Skipped`, `failed`, and a per-row `report`.

## Review afterwards
- `list_imports` / `get_import` show past runs and their per-row report.
- Imported products land with their source status (active/draft). Set HSN/GST (`update_product`) and review pricing before going live.

## Tips
- Shopify groups variant rows by Handle automatically — paste the whole CSV, including the variant/image rows.
- Prices in CSVs are read as major units (e.g. `249.00` → ₹249.00); JSON may use `priceMinor` directly.
- Large catalogs: the import runs synchronously and reports everything in one job.
