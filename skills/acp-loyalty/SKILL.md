---
name: acp-loyalty
description: Use when the user wants to set up a loyalty / rewards / points program (LoyaltyLion-style) on their ACP store via the Claude connector. Triggers on "set up loyalty", "rewards program", "points", "give points for purchases". Drives set_loyalty_program, get_loyalty_program, adjust_loyalty_points.
---

# Loyalty & rewards

Points are **earned automatically on paid orders**, lifetime points drive tiers, and shoppers redeem points for a checkout discount.

## Steps
1. `set_loyalty_program` with:
   - `storeId`, `enabled: true`
   - `pointsPerCurrencyUnit` — points earned per 1 major unit spent (e.g. 1 per ₹1)
   - `redeemValueMinorPerPoint` — value of each point on redemption (e.g. 10 = ₹0.10/point → 100 pts = ₹10)
   - `minRedeemPoints`, optional `signupBonus`
   - optional `tiers`: `[{ name, minPoints }]` (e.g. Silver:300, Gold:1000)
2. Verify with `get_loyalty_program`.
3. To grant/correct points manually, `adjust_loyalty_points` with `customerId`, signed `points`, `note`.

## Tips
- Earn only fires once a payment is **captured** (so configure payments first — see **acp-payments**).
- Redemption is capped at the order value and combines with bundle savings; shoppers redeem from the cart by entering their email.
