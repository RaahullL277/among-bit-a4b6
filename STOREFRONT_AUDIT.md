# Storefront Audit

Audited 2026-06-07. Buyer journey, cart/checkout, conversion, trust, SEO, mobile.

> **STATUS: P0/P1/P2 BUILT (2026-06-07).** See inline notes + commits.

## Strengths (reused)
Backend-backed cart; single-page checkout (address + live tax/shipping quote +
marketing opt-in + GST-invoice download + legal links); faceted **Shop**; PDP
gallery/variant selectors/specs/docs/price-breaks; reviews + ratings; wishlist;
subscriptions; self-serve returns/cancel; abandoned-cart recovery; the
auto-handoff support chat; per-page SEO meta.

## P0 — conversion blockers
- **P0-1 Cart was not editable.** Added cart **quantity stepper + remove item**
  (REST `PATCH/DELETE /storefront/carts/:cartId/items/:variantId`; `cart.service`
  `setItemQuantity`/`removeVariant`).
- **P0-2 No discount codes.** New `Discount` model (PERCENT/FIXED, min-spend,
  usage cap, expiry) + `DiscountService`; applied at checkout; storefront coupon
  field; admin **Discounts** manager + MCP tools.
- **P0-3 Empty SEO/social shell.** Enriched `index.html` (description, Open
  Graph/Twitter, theme-color, favicon); storefront emits **product JSON-LD** +
  OG/canonical per page. (True SSR/prerender needs a render server — noted as a
  follow-up; this delivers correct tags + structured data for the SPA.)

## P1 — buyer experience & trust
- **P1-4 Buyer accounts.** Email-OTP buyer login (`CustomerAuthService`,
  storefront session), **order history**, and **saved addresses**
  (`CustomerAddress`) — Account page + reuse at checkout.
- **P1-5 Post-payment confirmation.** Confirmation page polls order status and
  shows a "payment received" state once captured (no more dead-end "pending").
- **P1-6 Mobile nav/search.** Hamburger drawer + mobile search.
- **P1-7 Trust/merchandising.** Ratings on Shop cards + a trust bar
  (secure checkout · easy returns · GST invoice).

## P2 — polish & growth
- **Recently-viewed rail** — PDP records views in localStorage (`recently.js`);
  a rail (`RecentlyViewed` over `ProductRail`) shows them on Home + PDP.
- **Cart cross-sell** — "You might also like" rail on the cart (in-stock
  products not already in the cart).
- **Loading skeletons** — `Skeleton`/`SkeletonGrid` replace "Loading…" on
  Home + Shop grids.
- **Favicon / PWA manifest** — `manifest.webmanifest` + `icon.svg` (installable,
  maskable) + apple-touch-icon.
- **PDP breadcrumbs** — Home › Shop › product nav + `BreadcrumbList` JSON-LD.

## Follow-ups (not in this pass)
True SSR/prerender (needs a server-render layer); custom-domain / per-store host
routing; buyer saved payment methods; multi-currency/i18n.
