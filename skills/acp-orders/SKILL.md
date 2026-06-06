---
name: acp-orders
description: Use when the user wants to view or manage orders on their ACP store via the Claude connector — listing orders, inspecting a single order's items and payment, or updating fulfillment status (mark paid/fulfilled/cancelled/refunded). Triggers on "show my orders", "recent orders", "order details", "mark this order fulfilled", "cancel order", "what did they buy". Drives list_orders, get_order, update_order_status.
---

# Orders

Operate the order book. Orders flow through `PENDING → PAID → FULFILLED`, with
`CANCELLED` and `REFUNDED` as terminal states; payment status is driven by the
provider webhook (see **acp-payments**).

## View
- `list_orders` (optional `storeId`) → recent orders with status and totals.
- `get_order` with `orderId` → full detail: line items, customer, and payment.

## Manage
`update_order_status` with `orderId` + `status` (PENDING / PAID / FULFILLED /
CANCELLED / REFUNDED) → advance fulfillment or cancel. Use it to mark an order
fulfilled after dispatch, or cancelled/refunded when needed.

## Related
- **acp-shipping** — create a shipment + tracking for an order (auto-notifies the buyer).
- **acp-returns** — RMA flow and refunds for delivered orders.
- **acp-analytics** — revenue, AOV, and the conversion funnel across orders.
- Orders placed by an AI assistant carry channel attribution — see **acp-shopability**.

## Tips
- Prefer the shipping flow over manually setting FULFILLED when you have a courier, so the
  customer gets tracking automatically.
- Refunds for returns are best driven through **acp-returns**, which also restocks.
