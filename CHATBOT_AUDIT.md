# Chatbot Audit

Audited 2026-06-07. Covers the storefront sales/support bot
(`customer-support.service.ts`), its LLM abstraction (`assistant/`), the widget
(`storefront/ChatWidget.jsx`), the merchant inbox, and the WhatsApp path.

> **STATUS: P0/P1/P2 BUILT (2026-06-07).** See commits + the "Built" notes inline.

## Architecture
- **Support bot** runs store-scoped tools through a provider abstraction (Claude
  when `ANTHROPIC_API_KEY` is set, else a deterministic keyword stub), persists
  conversations, and escalates to a human (owner notified).
- **Tools (before):** `search_products`, `get_order_status` (email/phone verified),
  `escalate_to_human`.
- Merchant **inbox** (list/get/reply/setStatus); operator assistant is separate.

## Findings & fixes

### P0 — broke the core promise
- **P0-1 Keyword bot by default / no mode visibility.** `getConfig` now reports
  `llmActive` so the merchant sees whether Claude or the stub is live. (Key stays
  env-driven, `ANTHROPIC_API_KEY`.)
- **P0-2 Couldn't sell or see the catalog.** Added tools: `get_product`
  (variants/stock/options/images), `browse_catalog` (categories + brand/price
  filter via `CatalogService`), `add_to_cart`. Chat now returns `products`
  (rich suggestion cards) and `actions` (add-to-cart) the widget executes on the
  client cart.
- **P0-3 Broken human-handoff loop.** The widget now captures the shopper's
  email and sends `contact`; an agent reply now **emails the customer**
  (`SUPPORT_AGENT_REPLY` notification), closing the loop.

### P1 — quality & safety
- **P1-4 No policy/FAQ grounding.** Added `get_policies` (return + shipping +
  published legal policies) so the bot answers instead of deflecting.
- **P1-5 Unbounded history.** Only the last 20 turns are sent to the LLM.
- **P1-6 No input-size cap.** Messages capped at 2,000 chars.
- **P1-7 Provider leak.** `provider` removed from the public chat response.

### P2 — omnichannel & ops
- **P2-8 WhatsApp wasn't the bot.** `messaging.handleInbound` now routes inbound
  WhatsApp messages through the same `CustomerSupportService.chat` (real bot,
  per-phone conversation) instead of a static echo.
- **P2-9 No bot analytics.** Added `botAnalytics` (conversations, escalation rate,
  deflection rate, top tools) surfaced on the admin Support page.

## Not in this pass (follow-ups)
Streaming responses; CSAT capture; inbox SLA/assignment; prompt-injection
hardening of tool outputs; custom knowledge-base ingestion; proactive/
abandoned-cart chat.
