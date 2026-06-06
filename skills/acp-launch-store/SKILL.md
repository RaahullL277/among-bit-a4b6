---
name: acp-launch-store
description: Use when the user wants to create, build, or launch a new online store / ecommerce shop on the agentic commerce platform (ACP) via the Claude connector — including brand-new users with no account. Triggers on "launch a store", "set up my shop", "start selling", "create my ecommerce store". Drives the connector tools create_account, launch_store, create_product.
---

# Launch an ecommerce store

Stand up a complete, shoppable storefront in one go using the ACP commerce connector.

## First, check the session
Call `whoami`.
- **anonymous** (new user) → call `create_account` with `businessName` and `ownerEmail`. It returns an `apiKey` (tell the user to save it as their connector credential) and lets you keep building in this session.
- **merchant** (`sk_` key) → you already have a workspace; continue.
- **partner** → use the **acp-partner** skill first to pick a client with `use_client`, then continue.

## Launch
Call `launch_store` with:
- `name`, optional `currency` (default INR), `tagline`
- optional `brandColor` / `accentColor` (hex)
- `products`: array of `{ title, description?, priceMinor, costMinor?, inventory? }` — `priceMinor` is in paise (₹499 = 49900)
- `publish` (default true)

It creates the store, configures a (stubbed) payment provider, adds active products, applies the theme, and **publishes a storefront home page**. Share the returned `storefrontUrl` with the user.

## Then offer next steps
Suggest follow-on setup skills: payments (real keys), reviews, bundles, loyalty, subscriptions, SEO, pricing, shipping, marketing, support chatbot.

## Tips
- Prices are integers in the smallest currency unit (paise). Always confirm currency.
- To add more products later, use `create_product` with `storeId` + `variants:[{ priceMinor, costMinor?, inventory? }]` and `status:"ACTIVE"`.
- Get `storeId`/`variantId` values from `list_stores` / `list_products`.
