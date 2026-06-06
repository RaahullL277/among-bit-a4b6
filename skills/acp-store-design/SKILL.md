---
name: acp-store-design
description: Use when the user wants to design their storefront, build pages with a page builder, edit the home page, or set the theme/branding on their ACP store via the Claude connector. Triggers on "design my store", "build a landing page", "change the theme", "edit the home page", "add an about page". Drives create_page, update_page, publish_page, set_store_theme, list_pages.
---

# Store design & page builder

Pages are ordered lists of typed sections; the `home` slug is the storefront landing page.

## Theme
`set_store_theme` with `storeId`, hex `primaryColor` / `accentColor`, and `logoText`.

## Pages
1. `create_page` with `storeId`, `slug` (e.g. `home`, `about`), `title`, and `sections`. Section types and their `data`:
   - `hero`: `{ heading, subheading, ctaLabel, ctaHref }`
   - `rich_text`: `{ title, body }`
   - `image`: `{ imageUrl, alt }`
   - `product_grid`: `{ title, mode: "all" | "manual", productIds?, limit? }`
   - `featured_product`: `{ productId }`
   - `faq`: `{ title, items: [{ q, a }] }`
2. `update_page` to edit title/slug/sections/SEO; `publish_page` with `status` `PUBLISHED` (or `DRAFT`). Drafts stay hidden until published.
3. `list_pages` to review.

## Tips
- Product references in `product_grid` / `featured_product` are resolved to live products on the storefront.
- Set per-page SEO via the page's `metaTitle` / `metaDescription` (in `create_page` / `update_page`), and store-wide defaults via **acp-seo**.
