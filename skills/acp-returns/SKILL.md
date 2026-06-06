---
name: acp-returns
description: Use when the user wants to set up or handle returns / refunds / RMA / cancellations on their ACP store via the Claude connector, or configure the return & cancellation policy (return window, eligible reasons, restocking fee, auto-approve, buyer self-cancel window). Triggers on "handle returns", "process a refund", "approve a return", "RMA", "show pending returns", "set return window", "return policy", "let customers cancel orders", "restocking fee". Drives list_returns, update_return, get_return_policy, set_return_policy.
---

# Returns / RMA & cancellations

Customers raise a return from the storefront (verified by order number + email, optionally with a damage/unboxing video). You triage them.

## Policy (what the system enforces)
`get_return_policy` / `set_return_policy` with `storeId` configure the rules:
- `enabled` — accept returns at all.
- `returnWindowDays` — days after purchase a return is allowed (0 = no limit); later requests are rejected.
- `eligibleReasons` — reasons buyers may pick (DAMAGED / WRONG_ITEM / NOT_AS_DESCRIBED / NO_LONGER_NEEDED / OTHER).
- `restockingFeePercent` — auto-deducted from the refund.
- `autoApprove` — in-policy requests are approved on submission.
- `cancelEnabled` / `cancelWindowHours` / `allowCancelAfterShipment` — **buyer self-cancellation** rules. Buyers cancel their own order from the storefront Track page; a paid order is refunded automatically. Owner / partner-with-MANAGE set all of this; the storefront shows the live window + reasons.

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
