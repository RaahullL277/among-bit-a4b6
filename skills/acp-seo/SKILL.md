---
name: acp-seo
description: Use when the user wants to improve SEO, fix on-page issues, configure meta tags / sitemap, or optimize/compress images and add alt text (Plug-in-SEO / TinyIMG style) on their ACP store via the Claude connector. Triggers on "improve SEO", "run an SEO audit", "optimize images", "add alt text", "sitemap". Drives seo_audit, set_seo_settings, optimize_images.
---

# SEO & page speed

## Audit first
`seo_audit` with `storeId` returns an SEO-health score, a page-speed score, and a scored list of issues (missing/over-long meta, missing image alt, no images, large images).

## Fix issues
- Store defaults: `set_seo_settings` with `storeId`, `titleTemplate` (uses `{title}` and `{storeName}`), `defaultDescription`, `indexable`.
- Per-product meta: `update_product` with `metaTitle` / `metaDescription`.
- Images: `optimize_images` with `storeId` compresses all tracked images and reports bytes saved; alt text improves both SEO and accessibility.

## Tips
- The storefront serves `/sitemap.xml` and `/robots.txt`, and emits Product JSON-LD (price/availability/rating) automatically.
- Re-run `seo_audit` after fixes to confirm the score improved.
