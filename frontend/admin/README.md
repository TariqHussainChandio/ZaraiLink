# admin (app)

The administrator console: platform dashboard with the queues waiting for the admin, user management, listing, review and consultation moderation, expert verification, platform orders (with the admin's cancellation), reports, categories, reference data, the audit log (by SRDS §51 event) and admin analytics.

- **Owner lane:** `zl-admin` (docs/plan.md §3)
- **SRDS:** §12, §14, §51
- **API side:** [`backend/app/admin`](../../backend/app/admin/README.md)

## Public API

Other modules import only what [`index.ts`](index.ts) exports; the reality gate's `module-boundary` rule fails a deep import. Today: `ReportStatus` (the shared status vocabulary, `common/constants/status.ts`, names a report's states).

## Inside

`hooks/` · `screens/` (21, with the Moderation hub) · `services/` · `types/` · `index.ts`. Tests sit beside the code they test.

`navigation/` mounts its screens directly, in the admin shell's Overview, Approvals, Moderation and Audit tabs. The admin never sees dealer inventory (SRDS §15).
