# buyer (app)

The buyer's dashboard. Buying itself (browse, cart, checkout, orders, payments, reviews) lives in `common/`.

- **Owner lane:** `zl-buyer` (docs/plan.md §3)
- **SRDS:** §6, §26

## Public API

None: no other module imports from this one.

## Inside

`screens/` (1). Tests sit beside the code they test.

It has no `index.ts` and no API folder yet: nothing imports from it, and the buyer's data comes from `common/orders`.
