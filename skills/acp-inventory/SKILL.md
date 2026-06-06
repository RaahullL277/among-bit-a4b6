---
name: acp-inventory
description: Use when the user wants inventory / stock management on their ACP store via the Claude connector — checking which products are low or out of stock, days-of-cover, reorder points, or tuning the stock-health thresholds and low-stock alerts. Triggers on "what's low on stock", "stock health", "days of cover", "reorder point", "out of stock", "set low-stock threshold", "stock alerts". Drives get_stock_status, get_stock_policy, set_stock_policy.
---

# Inventory & stock health

The platform classifies every variant's stock as **GREEN / AMBER / RED** by *days of
cover* — projected days of inventory left at the recent sales velocity — not just raw
quantity, so fast sellers surface before they run out.

## Check
`get_stock_status` with `storeId` → red/amber/green health and days-of-cover for every
variant, so you can see what needs reordering.

## Policy
`get_stock_policy` / `set_stock_policy` with `storeId` tune:
- `greenDays` / `amberDays` — days-of-cover thresholds for healthy vs. low.
- `reorderPoint` — quantity at/below which a variant is flagged regardless of velocity.
- `velocityWindowDays` — the recent window used to estimate sales velocity.
- `enabled` — turn stock-health alerting on/off.

## Automatic alerts
A background job recomputes stock health continuously and notifies the store owner when
a variant **newly degrades** to AMBER (low stock) or RED (out of stock) — see
**acp-notifications** for the channels. Low/back-in-stock shopper messages live in **acp-automation**.

## Tips
- Days-of-cover beats raw counts: a "50 left" item can still be RED if it sells 20/day.
- After a big sale or restock, re-check `get_stock_status` to catch new RED variants.
