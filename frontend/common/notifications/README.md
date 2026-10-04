# common/notifications (app)

In-app notifications and the unread badge.

- **Owner lane:** `zl-comms` (docs/plan.md §3)
- **API side:** [`backend/app/common/notifications`](../../../backend/app/common/notifications/README.md)

## Public API

Other modules import only what [`index.ts`](index.ts) exports; the reality gate's `module-boundary` rule fails a deep import. Today: `NotificationBellButton`, `Notification`.

## Inside

`components/` · `hooks/` · `screens/` (1) · `services/` · `types/`. Tests sit beside the code they test.
