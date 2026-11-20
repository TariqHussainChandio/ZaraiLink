# admin (app)

The administrator console: platform dashboard with the queues waiting for the admin, user management, listing, review and consultation moderation, expert verification, platform orders (with the admin's cancellation), reports, categories, reference data, the audit log (by SRDS §51 event) and admin analytics.

- **Owner lane:** `zl-admin` (docs/plan.md §3)
- **SRDS:** §12, §14, §51
- **API side:** [`backend/app/admin`](../../backend/app/admin/README.md)

## Public API

Other modules import only what [`index.ts`](index.ts) exports; the reality gate's `module-boundary` rule fails a deep import. Today: `ReportStatus` (the shared status vocabulary, `common/constants/status.ts`, names a report's states) and `AdminMenuButton` (the side menu, mounted by `navigation/` on every admin tab's first screen, D19).

## Inside

`components/` (the side menu, the one confirmation sheet every admin act goes through, the document viewer, Load more) · `hooks/` (`useAdminPages` reads a list a page at a time) · `screens/` (with the Moderation hub) · `services/` · `types/` · `utils/` (the audit log in plain words) · `index.ts`. Tests sit beside the code they test.

Every admin act is confirmed first, says what it does, and asks for a reason wherever the API stores one: suspend, hide, dismiss, retire, approve, reject and change role go through `AdminActionSheet`; cancelling an order, settling a dispute, closing or cancelling a consultation and hiding a review use their own screens' reason sheets (A7; not yet moved onto `AdminActionSheet`). Every write is the one admin's (no second factor, D19) and is audit-logged by the database under its SRDS §51 name (A7, BR-15); reviews are hidden and restored, never deleted. Lists page past the API's 100-row cap; the API filters users on role and account status, reports on status, orders on disputed, and the audit log on one §51 event name or one table, so search and the other filters look through the pages already loaded.

`navigation/` mounts its screens directly, in the admin shell's Overview, Approvals, Moderation and Audit tabs. The admin never sees dealer inventory (SRDS §15).
