---
name: acp-reviews
description: Use when the user wants to set up, enable, or moderate customer product reviews / star ratings (judge.me-style) on their ACP store via the Claude connector. Triggers on "set up reviews", "moderate reviews", "approve reviews", "show pending reviews". Drives list_reviews and moderate_review.
---

# Customer reviews & moderation

Reviews are **on by default**: shoppers submit star ratings + text from product pages, and a review-request notification fires automatically when an order is delivered. Your job is moderation.

## Steps
1. `list_reviews` with `storeId` and `status:"PENDING"` to see what's waiting.
2. For each, `moderate_review` with `reviewId` and `status` = `APPROVED` or `REJECTED`. Only approved reviews appear on the storefront (with a "Verified purchase" badge when tied to a real paid order).

## Tips
- Approved reviews show star summaries on product cards and aggregate into Product JSON-LD for SEO (see **acp-seo**).
- To encourage reviews, make sure delivery notifications are enabled (see **acp-notifications**); the review request goes out on the DELIVERED event.
