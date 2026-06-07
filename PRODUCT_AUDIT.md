# Product / Catalog & Merchandising Audit

Audited 2026-06-07 against the verticals a store owner will most likely sell:
**fashion, lifestyle, cosmetics, jewellery, electronics, robotic parts, wellness.**

**Headline:** the platform nails the transactional spine (cart, tax/GST, per-variant
inventory + ledger, payments-shaped flow, reviews, bundles, subscriptions) but the
**catalog & merchandising layer is thin** — built for simple, single-variant,
text-only products. Every one of these verticals needs more on day one.

Severity: **P0** = blocks selling these verticals at all · **P1** = merchandising
depth · **P2** = vertical-specific / B2B / compliance.

---

## Evidence (current state)
- `Product`: title, description, status, hsnCode, gstRateBps, tags, meta — **no brand, category, product-type, attributes/specs, weight, dimensions, material, warranty, certifications, ingredients.**
- `ProductVariant`: price/sku/cost/inventory + freeform `options Json` — **no structured option types, barcode, per-variant weight, variant image, batch/expiry.**
- `Collection` is an **orphaned stub** — no product link, no service/controller. **No category system.**
- **Product images never reach the storefront** (`productInclude = { variants: true }`; no `<img>` anywhere in `storefront/`). `ImageAsset` is admin/SEO-only.
- Storefront product page renders `variants[0]` only — **no variant selector**, no gallery, no swatches.
- Search is plain text on title/description — **no facets, filters, sorting, or category nav.**
- Admin "New product" form creates **one variant**, no images, no attributes.

---

## P0 — Catalog blockers (build first)

### P0-1 — Product images on the storefront
- Schema: `ImageAsset` gains `position`, `isPrimary`, optional `variantId` (per-variant image).
- Core: include images (ordered) in product reads; storefront product payload carries an image list; cards carry a primary image. Image CRUD/reorder for a product.
- Surfaces: REST + MCP (`add_product_image`, `list_product_images`, `set_primary_image`, `reorder_product_images`, `remove_product_image`), admin product image manager, storefront **gallery** on the PDP + **primary image on cards** (Home/Search/Cart/Wishlist).

### P0-2 — Structured variant options + selection
- Schema: `ProductOption` (name, position) + `ProductOptionValue` (value, position); variant keeps its `options` map (`{ "Size": "M", "Color": "Red" }`) as the resolution key.
- Core: define options per product; create variants against option values; resolve a variant from a selected option map.
- Surfaces: REST + MCP (`set_product_options`, variant create with options), admin **variant matrix** editor, storefront **option selectors** (size/colour/shade) that resolve and price the chosen variant (+ swatch images via P0-1 variant images).

---

## P1 — Merchandising depth

### P1-1 — Categories (make `Collection` real)
- Schema: `Collection` gains `description`, `imageUrl`, `position`; new join `ProductCollection` (product ↔ collection, position).
- Core/Surfaces: collection CRUD + assign/unassign products; storefront **category navigation** + category pages; MCP tools; admin manager.

### P1-2 — Structured attributes / specifications
- Schema: `ProductAttribute` (name, value, unit?, position, `filterable`).
- Powers PDP **spec sheets / ingredients / material / dimensions** and **facets**. Core CRUD + MCP + admin editor + storefront spec table.

### P1-3 — Brand + product-type + faceted search
- Schema: `Product.brand`, `Product.productType`.
- Storefront search/listing gains **filters** (price range, brand, category, filterable attributes, option values) + **sorting**; backend faceted query.

---

## P2 — Vertical-specific, B2B & compliance

### P2-1 — Product file assets (datasheets, certificates, size charts, manuals)
- Schema: `ProductAsset` (type enum DATASHEET/CERTIFICATE/SIZE_CHART/MANUAL/OTHER, url, title, position) — for jewellery hallmark certs, electronics/robotics datasheets, fashion size charts, wellness/cosmetics certs.
- Core + MCP + admin + storefront "Documents" / "Size chart" links on the PDP.

### P2-2 — Warranty + compliance fields
- Schema: `Product.warrantyMonths`, `Product.warrantyTerms`, `Product.countryOfOrigin`, `Product.ingredients`; `ProductVariant.barcode`, `ProductVariant.batchNumber`, `ProductVariant.expiryAt`, `ProductVariant.weightGrams`, `ProductVariant.lengthMm/widthMm/heightMm`.
- Surfaces warranty + expiry + country-of-origin on the PDP; weight/dimensions feed shipping & jewellery weight context. (Full multi-batch lot ledger + serial/IMEI capture noted as a follow-up.)

### P2-3 — B2B tiered pricing + MOQ + lead time
- Schema: `PriceTier` (variant, minQuantity, priceMinor); `Product.moq`, `Product.leadTimeDays`.
- Checkout applies the best qualifying tier price per line; PDP shows the price-break table + MOQ + lead time. Core + MCP + admin + storefront.

---

## Reuse (don't rebuild)
Per-variant inventory + stock ledger, HSN/GST per product, reviews, bundles/cross-sell,
wishlist, subscriptions, the listing-agent content writer, and the categorized design
templates (`STORE_TEMPLATES`: fashion/lifestyle/cosmetics/jewellery). The variant
`options Json` field is the migration path to structured options.

## Follow-ups (not in this pass)
Multi-batch inventory lots; serial/IMEI capture at fulfilment; gold-rate-linked dynamic
jewellery pricing; weight/zone-based shipping rate cards; RFQ/quote workflow for B2B.
