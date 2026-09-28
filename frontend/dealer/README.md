# dealer (app)

The dealer's marketplace side: the dashboard (with the inventory tiles) and dealer analytics. The inventory screens themselves are in `inventory/`.

- **Owner lane:** `zl-dealer` (docs/plan.md §3)
- **SRDS:** §7, §16, §27–§28
- **API side:** [`backend/app/dealer`](../../backend/app/dealer/README.md)

## Public API

None: no other module imports from this one.

## Inside

`screens/` (2). Tests sit beside the code they test.

It has no `index.ts` yet because no other module imports from it; `navigation/` mounts its screens directly.
