---
name: acp-cohorts
description: Use when the user wants cohort intelligence / customer segmentation by behaviour or acquisition source on their ACP store via the Claude connector — micro-cohorts from what users browsed/clicked/added-to-cart/bought and which Meta campaign or Google search term they came from, hot/warm/cold classification, "what should this customer buy next", or the auto-recompute schedule/cadence. Triggers on "build cohorts", "segment my customers by behaviour", "who came from my Meta campaign", "hot vs cold customers", "what to recommend this customer", "how often do cohorts refresh". Drives recompute_cohorts, list_cohorts, cohort_schedule, customer_cohorts, customer_recommendations.
---

# Cohort intelligence

The store tracks the storefront funnel (land → view → click → add-to-cart) with acquisition attribution (Meta campaign / Google search term), then forms **micro-cohorts** two ways:
- **Behavioural** — soft clustering (fuzzy c-means) over engineered behaviour + attribution features, so a customer can belong to **several cohorts** with a weight.
- **Acquisition** — explicit cohorts per Meta campaign / Google search term.

## Recompute & schedule
`recompute_cohorts` with `storeId` re-runs the model now. Returns counts (behavioural / acquisition / customers).

The platform **also recomputes automatically** on a cadence chosen per store from its recent daily visitor volume — so busy stores stay fresh and quiet ones don't churn:
- **Nightly** for stores averaging **≥ 10,000** daily visitors
- **Weekly** for **1,000–10,000**
- **Monthly** for **< 1,000**

`cohort_schedule` with `storeId` returns the store's `cadence`, `avgDailyVisitors`, `lastRecomputedAt`, `nextDueAt`, and `dueNow`. Use `recompute_cohorts` for an immediate refresh between scheduled runs (e.g. after a big campaign launch).

## Explore
- `list_cohorts` with `storeId` → each cohort's label, size, and signature (top channel, avg orders/spend/views/carts).
- `customer_cohorts` with `customerId` → the cohorts a customer is in (weighted), their acquisition source, and **HOT / WARM / COLD** temperature (by purchase recency).

## Recommend
`customer_recommendations` with `customerId` → products that peers in the same cohorts bought (excluding what they already own). Use this to drive targeted upsell — e.g. a WhatsApp/email to a HOT customer with their top recommendation (see **acp-notifications**), or a win-back to COLD customers.

## Feeding the model
Acquisition attribution comes from `utm_source` / `utm_campaign` / `utm_term` on store links (the storefront captures them on landing). Behaviour events (view/add-to-cart/**search**) are tracked automatically; purchases come from orders. **On-site search** is both a clustering signal and forms **search-intent cohorts** (`Searched "blue shirt"`) — grouping shoppers by what they looked for, separately from the Google/acquisition term that brought them in.

## Tips
- A customer in multiple cohorts is expected and useful — they may be both "High-value buyers · Meta" and the "Meta · Summer Sale" acquisition cohort.
- Temperature: HOT ≤30 days since last purchase, WARM ≤90, COLD beyond / never.
