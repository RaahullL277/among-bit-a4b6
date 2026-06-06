---
name: acp-listing-agent
description: Use when a store owner wants to list a product fast from a photo on their ACP store via the Claude connector — "list this product", "create a listing from this photo", "add this to my store", "snap and sell". The listing agent orchestrates two sub-agents (content writer + photo enhancer) so the owner just provides a photo and sets price, discount, and stock. Also covers customising the listing harness (master prompt, brand voice, rules). Drives draft_listing, publish_listing, enhance_product_photo, write_product_content, get_listing_config, set_listing_config.
---

# Listing agent

Turn a snapped product photo into a live, well-merchandised product in one pass. The
owner provides a **photo** (+ a few words of hint) and chooses **price, discount, and
stock** — the agent does the rest, steered by the store's customisable **harness**.

## The flow
1. `draft_listing` with `storeId`, `imageUrl`, and a short `hint` (e.g. "blue cotton kurta").
   It runs both sub-agents and returns:
   - an **enhanced photo** (cleaned-up URL + alt text) — see **acp-photo-enhance**
   - **copy**: title, benefit-led description, bullets, SEO meta title/description, tags — see **acp-content-writer**
   - the effective **master prompt** used.
2. Review/tweak the copy with the owner. When driving this yourself, you ARE the content
   writer — improve the draft in the store's brand voice before publishing.
3. `publish_listing` with the final `title` / `description` / `tags` / SEO + the owner's
   `priceMinor` (what the customer pays), optional `discountPercent` (shows a struck-through
   "was" price), `stock`, and `status` (ACTIVE/DRAFT). Creates the product + variant and
   attaches the enhanced photo.

You can also call the sub-agents directly: `enhance_product_photo`, `write_product_content`.

## The harness (customise per store)
`get_listing_config` / `set_listing_config` tune how the agent writes and enhances:
- `masterPrompt` — override the built-in master prompt ({{storeName}}, {{brandVoice}}, {{tone}}, {{descWords}}, {{rules}}, {{photoPrefs}} are filled in).
- `brandVoice` / `tone` / `categoryHint` / `contentRules` (e.g. "mention free shipping", "no superlatives") / `descWords`.
- Photo prefs: `enhanceBackground`, `squareCrop`, `autoAltText`.

## Tips
- Price model: `priceMinor` is what the customer pays; `discountPercent` advertises a higher
  "was" price (struck-through on the storefront). No discount → no compare-at.
- Publish as `DRAFT` first if the owner wants to review on the storefront before going live.
- For a whole catalog from scratch, pair with **acp-launch-store**; for image-only work, **acp-images**.
