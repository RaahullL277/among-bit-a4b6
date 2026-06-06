---
name: acp-images
description: Use when the user wants product-image optimization / media management on their ACP store via the Claude connector — compressing images for page speed, seeing bytes saved, or setting alt text for accessibility and image SEO. Triggers on "optimize my images", "compress product photos", "page speed images", "how much did optimization save", "add alt text", "image SEO". Drives optimize_images, list_images, get_image_savings, set_image_alt.
---

# Images & media

Faster images mean better conversion and SEO. The platform compresses product images and
tracks the bytes saved, and manages alt text for accessibility + image search.

## Optimize
`optimize_images` with `storeId` → compress every not-yet-optimized image and report the
bytes saved. `get_image_savings` → the running total saved (bytes + percent) for the store.

## Browse
`list_images` with `storeId` (optional `productId`) → image assets with their optimization
state and current alt text.

## Alt text (accessibility + image SEO)
`set_image_alt` with `imageId` and `alt` → set descriptive alt text, or pass `generate: true`
to auto-generate it from the product context.

## Tips
- Run `optimize_images` after a bulk product/image import, then check `get_image_savings`.
- Good alt text helps screen-reader users and ranks images in search — pair with **acp-seo**.
