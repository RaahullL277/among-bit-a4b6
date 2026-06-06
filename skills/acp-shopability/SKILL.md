---
name: acp-shopability
description: Use when the user wants to control whether their ACP store is shoppable by external AI assistants — Claude, ChatGPT, Gemini, Perplexity, Copilot, Meta AI — turning agentic commerce on or off for the whole store or per assistant. Triggers on "make my store shoppable on ChatGPT", "let AI assistants buy from my store", "turn off Gemini shopping", "disable AI shopping", "is my store shoppable by Claude", "agentic commerce on/off". Store owners and partners (with MANAGE access) can both use it. Drives get_shopability, set_shopability, set_shopability_channel.
---

# Shopability (AI-assistant commerce on/off)

Every store can be made **shoppable by external AI assistants** through a public
agent-commerce surface (a manifest + product feed + gated checkout). This is
**separate from the website storefront** — a store can be open on the web but
closed to AI agents, or shoppable on some assistants and not others.

Supported assistants: **Claude, ChatGPT, Gemini, Perplexity, Copilot, Meta AI**.
Default for a new store: agentic commerce ON for all assistants.

## Who can change it
The store owner, or a **partner with delegated MANAGE access** (stores:write).
A partner with VIEW access can read it but not change it.

## Control it
- `get_shopability` with `storeId` → master switch + per-assistant enabled state + the agent note.
- `set_shopability` with `storeId` → set `enabled` (master on/off), replace `enabledChannels`
  (the allowed assistants), and/or set `agentNote` (guidance shown to agents).
- `set_shopability_channel` with `storeId`, `channel`, `enabled` → flip a single assistant
  (e.g. disable ChatGPT but keep Claude).

## How enforcement works
The toggle gates the public surface assistants consume:
- `GET /agent/{storeId}/manifest` — always readable; reports `shoppable: true/false` and the
  enabled assistants. An assistant identifies itself via `?channel=` or the `x-agent-channel` header.
- `GET /agent/{storeId}/feed` — the product feed; returns **403** when the store (or that
  assistant) is switched off.
- `POST /agent/{storeId}/carts` and `POST /agent/{storeId}/checkout` — gated buy actions.

So "disable ChatGPT shopping" means ChatGPT gets `shoppable: false` from the manifest and a
403 from the feed/checkout, while other assistants keep working.

## Tips
- Turning the master switch OFF disables all assistants at once; individual assistant toggles
  only apply while the master switch is ON.
- Suspending the store (status) also makes it not shoppable, regardless of this setting.
- Pair with **acp-store-design** / **acp-pricing** so the catalog agents see is well-presented.
