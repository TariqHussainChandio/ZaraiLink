# Notifications (§19)

## Scope assumption

**In-app only for this FYP baseline.** No push notification integration (FCM/APNs) is wired up.
Notifications are written to `public.notifications` and surfaced only while a user has the app
open (via Supabase Realtime) or when they open the Notifications screen. Revisit only if
explicitly requested — adding push would mean a device-token table, a push-sending step in
`backend/app/` (Module 19, since sending push requires a server-side call, not a client-side
one), and platform credentials (FCM server key / APNs cert) this project doesn't have.

## Write path

`notifications` (Module 4) grants `authenticated` only `select`/`update` — a user may read and
mark-read their own notifications, but never insert one. Every notification is written by a
Postgres trigger reacting to the event it represents (`20260827080000_notifications_triggers.sql`,
`20260827080100_notifications_lockdown.sql`), through one shared helper:

- `public.create_notification(user_id, type, payload, skip_self = true)` — `security definer`,
  bypasses `notifications`' owner-only grants to perform the insert. `skip_self` no-ops the call
  when the recipient is also the session that triggered the underlying change (so e.g. a seller
  confirming an order doesn't get a redundant "order confirmed" notification about their own
  action) — except `inventory_low_stock`, which passes `skip_self = false` deliberately: the
  dealer is normally the one whose own stock adjustment crosses the threshold, and needs that
  notification precisely because they caused it.
- All 9 event trigger functions are themselves `security definer` too, **not** for the event
  logic (which needs no elevated privilege) but so their internal call to `create_notification`
  runs as the function owner rather than the invoking client. `EXECUTE` on `create_notification`
  is revoked from `anon`/`authenticated`/`public` — a client can never call it directly via
  `/rest/v1/rpc/create_notification` to inject an arbitrary notification into someone else's
  inbox. This was found and fixed during Module 13, not designed in from the start: the first
  version of this migration left `create_notification` publicly callable, which the Supabase
  security advisor doesn't flag on its own (it only flags `security definer` functions being
  *callable*, not what they let you write) — caught by reasoning about what a malicious
  `authenticated` caller could do with it, not by tooling.

## Events covered

| Event | Trigger | Recipient(s) |
|---|---|---|
| New order | `orders` after insert | seller |
| Order status change | `orders` after update (`status`) | buyer + seller |
| Payment result | `payments` after update (`status`) | buyer |
| New message | `messages` after insert | the other conversation participant |
| Consultation request | `consultations` after insert | assigned expert, if set |
| Consultation status change | `consultations` after update (`status`) | requester + assigned expert |
| Listing status change | `listings` after update (`status`) | owner |
| Inventory low stock | `inventory` after update, only when crossing *into* the threshold | dealer |
| Expert verification decision | `experts` after update (`verification_status`) | the expert |
| Account suspension toggled | `profiles` after update (`is_suspended`) | the affected user |

Consultation triggers are schema-ready but dormant — nothing writes to `consultations` yet
(Module 14).

## Entry points by role

There's no single "Notifications" tab for every role (SRDS's per-role nav trees don't all
include one):

- **Expert** has a dedicated `Notifications` bottom tab (`EXPERT_TABS.Notifications`) with a
  live `tabBarBadge`.
- **Buyer/farmer/dealer** and **admin** don't — they reach `NotificationListScreen` via a bell
  icon (`NotificationBellButton`, with its own unread-count badge) on their dashboard header
  (`HOME_ROUTES.Notifications`, `ADMIN_HOME_ROUTES.Notifications` respectively).

`useUnreadNotificationsCount` (per-consumer, not a shared store — mirrors how most of this app
fetches locally per screen rather than caching) backs both the tab badge and the bell badge, kept
live via `useRealtimeNotifications` (requires `public.notifications` in the `supabase_realtime`
publication, added in the same migration as the triggers).
