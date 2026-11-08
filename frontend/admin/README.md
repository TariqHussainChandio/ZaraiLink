# admin (app)

The administrator console: platform dashboard, user management, listing moderation, expert verification, platform orders, reports, categories, reference data, the audit log and admin analytics.

- **Owner lane:** `zl-admin` (docs/plan.md §3)
- **SRDS:** §12, §14, §51
- **API side:** [`backend/app/admin`](../../backend/app/admin/README.md)

## Public API

Other modules import only what [`index.ts`](index.ts) exports; the reality gate's `module-boundary` rule fails a deep import. Today: `ReportStatus` (the shared status vocabulary, `common/constants/status.ts`, names a report's states).

## Inside

`components/` (the one confirmation sheet every admin act goes through, the document viewer, Load more) · `hooks/` (`useAdminPages` reads a list a page at a time) · `screens/` (11, with the Moderation hub) · `services/` · `types/` · `utils/` (the audit log in plain words) · `index.ts`. Tests sit beside the code they test.

Every admin act (suspend, hide, dismiss, retire, delete, approve, reject, change role) asks in `AdminActionSheet` first, says what it does, asks for a reason only where the API stores one (report notes, an application decision), and offers Undo where the act can be reversed (BR-15). Lists page past the API's 100-row cap; the API filters only on role, account status, report status and one audit table, so search and the other filters look through the pages already loaded.

`navigation/` mounts its screens directly, in the admin shell's Overview, Approvals, Moderation and Audit tabs. The admin never sees dealer inventory (SRDS §15).
