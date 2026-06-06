---
name: acp-payments
description: Use when the user wants to set up, connect, or configure payments / checkout (Razorpay or GoKwik) for their ACP store via the Claude connector. Triggers on "set up payments", "connect Razorpay", "accept payments", "configure checkout". Drives configure_payment_provider and checkout.
---

# Set up payments & checkout

## Steps
1. Get the `storeId` (`list_stores`).
2. Call `configure_payment_provider` with `storeId`, `provider` (`RAZORPAY` or `GOKWIK`), and `credentials` (e.g. `{ keyId, keySecret, webhookSecret }`). Credentials are encrypted at rest.
3. Test it: `checkout` with `storeId` and `items:[{ variantId, quantity }]` → expect a PENDING order with a `payment.providerRef`. Payment is captured via the provider's signed webhook (`POST /webhooks/:provider`), which flips the order to PAID.

## Tips
- A newly launched store already has a **stubbed** Razorpay provider so checkout works for demos. Replace it with real credentials here.
- The same webhook capture is what converts an abandoned cart and awards loyalty points.
