---
name: acp-pricing
description: Use when the user wants pricing intelligence — track competitor prices, set repricing rules, analyze margins, or automatically reprice — on their ACP store via the Claude connector. Triggers on "track competitor prices", "repricing", "set up dynamic pricing", "what's my margin", "beat competitors". Drives add_competitor_price, set_pricing_rule, analyze_pricing, run_repricing.
---

# Pricing intelligence

## 1. Make sure costs are set
Margins need unit cost. Set `costMinor` on variants when creating products (`create_product`). Without cost, margin shows as unknown.

## 2. Track competitors
`add_competitor_price` with `variantId`, `competitorName`, `priceMinor`, optional `url`, `inStock`.

## 3. Configure the rule
`set_pricing_rule` with `storeId` and:
- `enabled`, `strategy` (`MATCH_LOWEST`, `BEAT_LOWEST`, `FIXED_MARGIN`)
- `adjustValue` (+ `adjustIsPercent`) — how much to undercut, or the target margin % for FIXED_MARGIN
- `minMarginPercent` — the floor; repricing **never** prices below the margin that yields this off cost
- optional `roundTo99` (charm pricing)

## 4. Analyze & apply
- `analyze_pricing` with `storeId` → per-variant margin, market position, and a recommended price.
- `run_repricing` with `storeId` (preview) and again with `apply: true` to write the new prices.

## Tips
- The margin floor protects you from a price war: even MATCH_LOWEST won't sell below your minimum margin.
