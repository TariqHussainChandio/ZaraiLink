# Feature register (v0, 2026-09-21)

The single, truthful list of what the product can and cannot do today. Any capability that is not
`Works` must be hidden or disabled in the UI, never shipped as a dead button. Update this file in
the same change that changes a capability's state, and link the evidence.

**Statuses**

| Status | Meaning |
|---|---|
| Works (API) | Observed working through the real backend against a real local database. The screens are not yet verified on a device, so this is not yet `Works` for users |
| Broken | Observed failing (HTTP 500 or equivalent) in the P0 run |
| Broken (static) | Fails for the same proven cause as a sibling that was observed failing (unsupported call in the pinned client), but was not itself executed because an earlier step is blocked |
| Blocked | Cannot work until an external service is provisioned |
| Not started | No implementation exists |
| Unverified | Not exercised in P0 |

Evidence: [baseline-2026-09.md](baseline-2026-09.md), and for the device checks [p2-expo-2026-09.md](p2-expo-2026-09.md). Defect ids (C, H, M) refer to the plan's audit;
N ids are from the baseline report.

## Authentication

| Capability | Status | Evidence and cause | Fix phase |
|---|---|---|---|
| Email sign-up with code verification | Blocked | Email carries a link, not a code (A2); hosted default sender reaches only team members. Needs custom SMTP (G1) and a token template | P4 |
| Email sign-in, confirmed user | Works (API) | A6 | P4 |
| Phone sign-up / sign-in / verify | Blocked | `phone_provider_disabled` (A4). Needs an SMS provider (G2) | P4D |
| Password reset | Blocked | Real users cannot get the email until G1 exists. On the Android emulator against the local stack the rest works: request in the app, email in the local mail catcher, tap the link while the app is running, and the app shows the new-password screen ([P2 report](p2-expo-2026-09.md)). A made-up or expired code shows the user nothing: the handler only catches thrown errors, and supabase-js returns them instead | P4 |
| Role chosen at sign-up | Broken | A public sign-up can create an admin (A1, A3b, C1) | P3 |
| Session storage | Works, insecure | Plain AsyncStorage (H1) | P4 |
| Suspension | Works (API) | B12. RLS side not re-run here | P4 |
| Role gates on API routes | Works (API) | B11 | P5 |
| Account deletion | Not started | Required by Google Play | P4 |
| Admin two-factor | Not started | Disabled in config | P4 |

## Marketplace, orders, payments

| Capability | Status | Evidence and cause | Fix phase |
|---|---|---|---|
| Reference data (categories, crops, units, currencies) | Works (API) | B1 | — |
| Browse listings | Works (API) | B3 | — |
| Create listing | Broken | B2, HTTP 500 (N1) | Repair, then P5 |
| Edit listing, change status | Broken (static) | Same unsupported call (N1) | Repair |
| Category create / edit (admin) | Broken (static) | N1 | Repair |
| Checkout with delivery charge | Broken | B4, HTTP 500 (N1) | Repair |
| Order status transitions, stale-order expiry | Unverified | Blocked by checkout | Repair |
| Atomic stock reduction on confirm | Unverified | Migration applies; blocked by checkout | Repair |
| Payment: manual / cash on delivery | Broken (static) | Payment insert and update use the unsupported call (N1) | Repair |
| Payment gateway | Not started | Needs a merchant account (G7) | P10 |
| Reviews (order, consultation) | Broken (static) | N1 | Repair |

## Roles

| Capability | Status | Evidence and cause | Fix phase |
|---|---|---|---|
| Dealer: stores, inventory, suppliers read | Works (API) | GET sweep | — |
| Dealer: create store, inventory item, supplier | Broken | B8, B8c HTTP 500; supplier static (N1) | Repair |
| Farmer: farms, profile read | Works (API) | GET sweep | — |
| Farmer: create / edit farm and crops | Broken (static) | N1 | Repair |
| Farmer analytics | Broken | HTTP 500 (N2) | Repair |
| Expert: directory, own profile read | Works (API) | GET sweep | — |
| Expert: application, profile update | Broken (static) | N1 | Repair |
| Expert analytics | Broken | HTTP 500 (N2) | Repair |
| Consultations: list mine / assigned | Broken | HTTP 500 (N2) | Repair |
| Consultations: create request, send message | Broken (static) | N1 | Repair |
| Dealer and admin analytics | Works (API) | GET sweep | — |
| Admin: stats, users, reports, audit log, orders read | Works (API) | GET sweep | — |
| Admin: moderation and verification writes | Unverified | Not exercised | P5 |

## Messaging and notifications

| Capability | Status | Evidence and cause | Fix phase |
|---|---|---|---|
| Conversations list | Works (API) | GET sweep | — |
| Send message, create conversation | Broken (static) | N1 | Repair |
| In-app notifications list and unread count | Works (API) | GET sweep | — |
| Realtime delivery | Unverified | Not exercised | P5 |
| Push notifications | Not started | No token table, no sender (G6) | P10 |

## AI disease advisory

| Capability | Status | Evidence and cause | Fix phase |
|---|---|---|---|
| Create case and predict, fresh environment | Broken | B10b: service role has no privileges after the migrations (N3) | P3 / P6 |
| Predict, privileges present | Works, limited | B10d. No rejection of non-leaf images (H8); 38 PlantVillage classes, none of Pakistan's staple crops; server fetches client URLs (C2) | P3, P9 |
| Prediction on a real photo | Unverified | The integration test fixture does not exist (N4) | P9 |

## Platform

| Capability | Status | Evidence and cause | Fix phase |
|---|---|---|---|
| Migrations apply from an empty database | Works | 35 of 35 applied, seed loaded | — |
| English and Urdu strings | Partial | 62 of 65 screens wired; no RTL handling; no Urdu font (M3) | P8 |
| Dark mode, edge-to-edge on Android 16 | Unverified | Needs a device | P8 |
| Release build signing | Not ready | Signed with the debug keystore (H3) | P2, P12 |
| CI | Partial | Lint, typecheck, jest, pytest, migration lint. No coverage gate, no E2E, no security scans | P1, P12 |
