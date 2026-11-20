# common/profile (app)

View and edit the profile, settings, password change, the optional two-step verification and account deletion. The admin's Account is read-only apart from the password (D19).

- **Owner lane:** `zl-accounts` (docs/plan.md §3)
- **SRDS:** §13
- **API side:** [`backend/app/common/profile`](../../../backend/app/common/profile/README.md)

## Public API

Other modules import only what [`index.ts`](index.ts) exports; the reality gate's `module-boundary` rule fails a deep import. Today: `useUpdatePassword`.

## Inside

`hooks/` · `screens/` (6) · `services/`. Tests sit beside the code they test.
