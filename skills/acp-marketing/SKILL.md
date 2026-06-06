---
name: acp-marketing
description: Use when the user wants to connect email marketing — Klaviyo, Mailchimp, or Brevo (Sendinblue) — and sync customers on their ACP store via the Claude connector. Triggers on "connect Klaviyo", "set up Mailchimp", "email marketing", "sync customers to my ESP". Drives configure_marketing and sync_marketing.
---

# Email marketing connectors

## Steps
1. `configure_marketing` with `storeId`, `provider` (`KLAVIYO`, `MAILCHIMP`, or `BREVO`), and `credentials` (e.g. `{ apiKey, listId }`). Encrypted at rest.
2. `sync_marketing` with `storeId` to push existing customers to the connected provider(s).

## Tips
- After connecting, new customers auto-sync on creation, and a paid order records a "Placed Order" event.
- These are stubbed adapters in dev (no real network calls); real REST implementations slot in behind the same interface.
