# admin (app)

The administrator console: platform dashboard, user management, listing moderation, expert verification, platform orders, reports, categories, reference data, the audit log and admin analytics.

- **Owner lane:** `zl-admin` (docs/plan.md §3)
- **SRDS:** §12, §14, §51
- **API side:** [`backend/app/admin`](../../backend/app/admin/README.md)

## Public API

Other modules import only what [`index.ts`](index.ts) exports; the reality gate's `module-boundary` rule fails a deep import. Today: `ReportStatus` (the shared status vocabulary, `common/constants/status.ts`, names a report's states).

## Inside

`hooks/` · `screens/` (11, with the Moderation hub) · `services/` · `types/` · `index.ts`. Tests sit beside the code they test.

`navigation/` mounts its screens directly, in the admin shell's Overview, Approvals, Moderation and Audit tabs. The admin never sees dealer inventory (SRDS §15).
