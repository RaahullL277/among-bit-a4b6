---
name: acp-shipping
description: Use when the user wants to set up shipping / fulfillment, connect a courier (Delhivery), or create shipments and tracking on their ACP store via the Claude connector. Triggers on "set up shipping", "connect Delhivery", "create a shipment", "fulfil an order", "tracking". Drives configure_shipping, create_shipment, list_shipments.
---

# Shipping & fulfillment

## Connect the courier
`configure_shipping` with `storeId` and `credentials` (e.g. `{ token, pickupName, webhookSecret }`). Encrypted at rest.

## Create shipments
`create_shipment` with `storeId`/`orderId` and the delivery address. Creating a shipment fulfils the order; tracking advances via the courier's signed webhook (`/webhooks/shipping/:provider`), notifying the customer at shipped / out-for-delivery / delivered.

## Review
`list_shipments` with `storeId` (optionally by `status`).

## Tips
- Shipments can be **insured** and carry a packed-order video for dispute evidence.
- The DELIVERED milestone also triggers the review-request notification (see **acp-reviews**).
