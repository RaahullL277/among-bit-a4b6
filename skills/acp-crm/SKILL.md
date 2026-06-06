---
name: acp-crm
description: Use when the user wants to manage customers / CRM on their ACP store via the Claude connector — view a customer's 360° profile, lifetime value (LTV), order history, segments (VIP/repeat/lapsed/at-risk), or add tags & notes. Triggers on "show my customers", "who are my VIPs", "customer lifetime value", "tag this customer", "find lapsed customers", "customer profile". Drives list_customers, get_customer_profile, update_customer, customer_summary.
---

# Customers & CRM

The platform keeps a customer record (auto-created at checkout) linked to orders, loyalty, subscriptions, reviews, returns, and support. Use these tools to manage relationships.

## Overview
`customer_summary` with `storeId` → total customers, repeat rate, average lifetime value, and a segment breakdown.

## Find & segment
`list_customers` with `storeId`, optional `search` (name/email/phone), and optional `segment`:
- `NEW` (no paid orders), `ONE_TIME`, `REPEAT` (≥2 orders), `VIP` (high spend or ≥5 orders),
  `AT_RISK` (no order in 90–180 days), `LAPSED` (no order in 180+ days).
Each row includes orders, lifetime spend, last order, and tags.

## 360° profile
`get_customer_profile` with `customerId` → lifetime value, paid orders, AOV, days since last order, segment, loyalty (points/tier), active subscriptions, review/return counts, open support, and recent orders.

## Tag & note
`update_customer` with `customerId` and any of `name`, `email`, `phone`, `tags` (array; de-duplicated), `notes`. Use tags for ad-hoc segments (e.g. `vip`, `wholesale`) and notes for context.

## Tips
- Segments are heuristic (RFM-style) defaults; use them to target outreach — e.g. send a win-back WhatsApp to `LAPSED` customers (see **acp-notifications**), or grant loyalty points to `VIP`s (see **acp-loyalty**).
- For campaigns/flows, push customers to the connected ESP with `sync_marketing` (see **acp-marketing**).
