---
name: acp-notifications
description: Use when the user wants to set up customer notifications — email, SMS, or WhatsApp — and choose which events notify whom on their ACP store via the Claude connector. Triggers on "set up notifications", "configure email/SMS/WhatsApp alerts", "order confirmation emails", "notify customers". Drives configure_email, configure_sms, configure_whatsapp, set_notification_preference, send_notification.
---

# Customer notifications

## Connect channels
- `configure_email` — Resend: `{ apiKey, fromAddress }`
- `configure_sms` — MSG91: `{ authKey, senderId }`
- `configure_whatsapp` — `{ phoneNumberId, token }`

## Choose what fires
`set_notification_preference` with `storeId`, an `event` (e.g. `ORDER_PLACED`, `ORDER_PAID`, `SHIPMENT_CREATED`, `DELIVERED`, `ABANDONED_CART`, `REVIEW_REQUEST`), a `recipientType` (`CUSTOMER` / `STORE_OWNER`), and the `channels` list. Review with `list_notification_preferences`.

## Send ad-hoc
`send_notification` for a one-off; `send_whatsapp_message` for a direct WhatsApp.

## Tips
- Sensible defaults exist out of the box, so notifications work before you customize anything.
- WhatsApp/email/SMS are stubbed adapters in dev.
