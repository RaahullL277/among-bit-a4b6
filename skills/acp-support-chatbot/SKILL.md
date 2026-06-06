---
name: acp-support-chatbot
description: Use when the user wants to set up the storefront AI sales & support chatbot / assistant on their ACP store via the Claude connector. Triggers on "set up the support bot", "add a chat assistant", "configure the chatbot", "AI customer support". Drives configure_support_bot.
---

# Storefront support chatbot

The storefront assistant answers from the live catalog and verified order status, and escalates to a human inbox when needed.

## Steps
`configure_support_bot` with:
- `storeId`, `enabled: true`
- `displayName` (e.g. "Chai Helper")
- `greeting` (shown when the chat opens)
- `persona` — tone, policies, and what to emphasize (e.g. "Friendly; always mention free shipping over ₹499; never promise delivery dates.")

## Tips
- The bot uses Claude tool-use when an Anthropic API key is configured on the server, and a deterministic fallback otherwise.
- Conversations land in the merchant support inbox where a human can reply and resolve.
