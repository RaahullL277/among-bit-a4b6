---
name: acp-analytics
description: Use when the user wants store analytics / KPIs / reporting on their ACP store via the Claude connector — revenue, orders, average order value, new customers, the cart→checkout→paid funnel, conversion rates, best-selling products, or AI-assistant-driven sales. Triggers on "how's my store doing", "revenue this month", "what's my conversion rate", "show the funnel", "best sellers", "how much did ChatGPT/Claude sell", "sales report". Drives get_analytics_summary, get_analytics_revenue, get_analytics_funnel, get_top_products, get_agent_sales.
---

# Analytics

Read-only reporting over the commerce data. All queries are tenant- (and optionally
store-) scoped and bounded by a date range (default: last 30 days). Pass `storeId`
to focus one store, and `from`/`to` (ISO dates) to set the window.

## KPIs
`get_analytics_summary` → revenue, orders, paid orders, average order value, new
customers, carts created / abandoned / recovered, payment conversion, cart conversion.

## Trends
`get_analytics_revenue` with an `interval` of `day` / `week` / `month` → revenue and
order counts bucketed over time (for a chart or trend read-out).

## Funnel
`get_analytics_funnel` → the cart → checkout → paid funnel with the conversion rate
at each step. Use it to spot where shoppers drop off.

## Products
`get_top_products` (optional `limit`) → best-sellers by revenue and units.

## AI-assistant attribution
`get_agent_sales` → paid orders and revenue driven by each shopping assistant
(Claude, ChatGPT, Gemini, …) and their share of total revenue. Answers "how much did
agentic commerce bring?" (see **acp-shopability** to turn assistants on/off).

## Tips
- Combine with **acp-pricing** (margins) and **acp-inventory** (cover) for a fuller picture.
- Revenue counts only paid/fulfilled orders; pending agent or web orders show once captured.
