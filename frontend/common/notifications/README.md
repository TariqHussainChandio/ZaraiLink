# common/notifications (app)

In-app notifications and the unread badge.

- **Owner lane:** `zl-comms` (docs/plan.md §3)
- **API side:** [`backend/app/common/notifications`](../../../backend/app/common/notifications/README.md)

## Public API

Other modules import only what [`index.ts`](index.ts) exports; the reality gate's `module-boundary` rule fails a deep import. Today: `NotificationBellButton`, `Notification`.

## Inside

`components/` · `hooks/` · `screens/` (1) · `services/` · `types/`. Tests sit beside the code they test.

## What a notification opens

`hooks/notificationTargets.ts` maps each type to its screen through `navigateInTab`: orders and payments to the order, messages to the chat, consultation requests and updates to the consultation, listings to the listing, low stock to the dealer's inventory, account and verification changes to the account. A type or payload without a target only clears its dot. A new type is added there and in `NotificationRow`'s copy.
