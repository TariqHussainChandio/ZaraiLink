# admin (app)

The administrator console: platform dashboard, user management, listing moderation, expert verification, platform orders, reports, categories, reference data, the audit log and admin analytics.

- **Owner lane:** `zl-admin` (docs/plan.md §3)
- **SRDS:** §12, §14, §51
- **API side:** [`backend/app/admin`](../../backend/app/admin/README.md)

## Public API

None: no other module imports from this one.

## Inside

`hooks/` · `screens/` (10) · `services/` · `types/`. Tests sit beside the code they test.

It has no `index.ts` yet because no other module imports from it; `navigation/` mounts its screens directly. The admin never sees dealer inventory (SRDS §15).
