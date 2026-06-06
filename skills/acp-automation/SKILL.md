---
name: acp-automation
description: Use when the user wants engagement/lifecycle marketing automation on their ACP store via the Claude connector — sending new-in-stock, best-selling, slow-moving, low-stock, back-in-stock, discount, festive-discount, abandoned-cart, or cohort-based product offers over email/SMS/WhatsApp, with hyper-personalised copy, hot/warm/cold send-frequency control, and protection against over-messaging customers who sit in multiple cohorts. Triggers on "set up campaigns", "abandoned cart messages", "win-back lapsed customers", "festive sale blast", "low stock alerts to shoppers", "how often do we message customers", "don't spam my customers". Drives setup_engagement_defaults, configure_engagement_campaign, list_engagement_campaigns, list_engagement_templates, set_engagement_policy, get_engagement_policy, preview_engagement_message, run_engagement, engagement_log.
---

# Engagement automation

Turn nine merchandising/lifecycle **triggers** into channel messages, each with a
library of **5 ready-to-use templates per channel** (email / SMS / WhatsApp):

`NEW_IN_STOCK` · `BEST_SELLING` · `SLOW_MOVING` · `LOW_STOCK` · `BACK_IN_STOCK` ·
`DISCOUNT` · `FESTIVE_DISCOUNT` · `ABANDONED_CART` · `COHORT_OFFER`

Three agents cooperate on every run:
1. **Hyper-personalisation** — picks the best of the 5 template variants for each
   customer (biased by temperature) and fills it with their first name, cohort, and
   **cohort-based recommendations** ("others in your cohort bought…").
2. **Frequency adjustment** — caps promo touches per rolling 7 days by temperature:
   HOT shoppers tolerate more, WARM fewer, COLD a gentle re-engage only.
3. **Cross-cohort dedup / fatigue guard** — a customer who matches several
   campaigns gets only their **single highest-priority** message per run, and a
   per-day cap + minimum gap + quiet hours stop over-messaging across runs.

## Get started fast
`setup_engagement_defaults` with `storeId` (optionally `channel`) enables every
trigger on one channel and creates a sensible frequency policy. Then `run_engagement`
with `dryRun: true` to preview who would get what before sending for real.

## Configure
- `list_engagement_templates` (filter `trigger` / `channel`) → browse the 5 variants.
- `configure_engagement_campaign` → enable/disable a trigger on a channel; optionally
  pin a `templateKey`, narrow by `temperatures` (HOT/WARM/COLD) or a `cohortKey`, set `priority`.
- `list_engagement_campaigns` → what's currently configured.

## Frequency (the anti-spam controls)
`get_engagement_policy` / `set_engagement_policy` tune:
- `hotMaxPer7Days` / `warmMaxPer7Days` / `coldMaxPer7Days` — per-temperature 7-day caps.
- `perCustomerDailyCap` — total messages/day for any one customer (cross-cohort guard).
- `minHoursBetween` — minimum gap between two messages.
- `quietStartHour` / `quietEndHour` — no-send window.

## Send & inspect
- `preview_engagement_message` (`customerId`, `trigger`, `channel`) → the exact
  hyper-personalised copy a customer would receive. No send.
- `run_engagement` (`dryRun` optional, `triggers` optional) → builds audiences,
  dedups to one message per customer, applies caps, and sends (or simulates).
  Returns `considered / sent / suppressed / skipped` and `byTrigger`.
- `engagement_log` → the audit trail (SENT / SUPPRESSED / SKIPPED with reasons like
  `min_gap`, `daily_cap`, `weekly_cap_cold`, `quiet_hours`, `no_email`).

## How it runs automatically
Once a store has a policy (e.g. via `setup_engagement_defaults`), the platform runs
engagement **once a day** for it, respecting quiet hours and all caps. Use
`run_engagement` for an immediate send (e.g. a festive-sale blast).

## Tips
- Reachability: a campaign's channel needs the customer's email (EMAIL) or phone
  (SMS/WhatsApp); otherwise that customer is `SKIPPED`. The channel must also be
  configured under integrations to actually deliver.
- Cohort offers and recommendations lean on **acp-cohorts** — recompute cohorts first
  for the richest personalisation.
- Priority order when a customer matches many triggers: abandoned cart → back in
  stock → low stock → cohort offer → new in stock → best selling → festive → discount
  → slow moving.
