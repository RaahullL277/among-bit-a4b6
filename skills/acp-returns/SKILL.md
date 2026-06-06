---
name: acp-returns
description: Use when the user wants to set up or handle returns / refunds / RMA on their ACP store via the Claude connector. Triggers on "handle returns", "process a refund", "approve a return", "RMA", "show pending returns". Drives list_returns and update_return.
---

# Returns / RMA

Customers raise a return from the storefront (verified by order number + email, optionally with a damage/unboxing video). You triage them.

## Steps
1. `list_returns` with `storeId` and `status:"REQUESTED"` to see new requests (each shows items, reason, evidence video, and a computed refund).
2. `update_return` with `returnId` and `action`:
   - `approve` (optional `note`) → notifies the customer to ship it back
   - `reject` (optional `note`)
   - `receive` → mark the item received
   - `refund` (optional `amountMinor`) → refunds via the payment adapter; a full refund flips the order + payment to REFUNDED
   - `cancel`

## Tips
- Only paid orders are returnable. Notifications fire at request / approve / reject / refund.
- A guarded state machine enforces valid transitions (e.g. you can't refund a rejected return).
