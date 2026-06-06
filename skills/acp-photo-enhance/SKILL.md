---
name: acp-photo-enhance
description: Sub-agent of the listing agent. Use when enhancing a snapped product photo for an ACP listing — clean background, square crop, brightness/contrast/sharpen, and descriptive alt text. Triggers on "enhance this product photo", "clean up the background", "make this photo listing-ready", "alt text for this image". Drives enhance_product_photo.
---

# Photo-enhancer sub-agent

Make a quickly-snapped product photo listing-ready, per the store's photo preferences, and
return an enhanced image URL plus descriptive **alt text** (accessibility + image SEO).

## Do
- `enhance_product_photo` with `storeId`, `imageUrl`, and an optional `hint` → returns
  `{ enhancedUrl, alt, adjustments }`.
- Applies, per the harness (`get_listing_config`): background cleanup (`enhanceBackground`),
  1:1 square crop (`squareCrop`), auto brightness/contrast + sharpen, and auto alt text
  (`autoAltText`).

## Tips
- Square crops sit best in storefront grids; a clean background lifts perceived quality.
- Good alt text describes the subject plainly ("Blue cotton kurta on a clean background") — it
  helps screen-reader users and image search.
- This is the photo step of the **acp-listing-agent** flow. For bulk optimisation of an existing
  catalog (compression + savings), use **acp-images** instead.
