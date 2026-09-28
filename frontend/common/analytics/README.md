# common/analytics (app)

The numbers on the role dashboards: farmer, dealer, expert and admin analytics hooks and the shared `SellerDashboard`. It stays in `common/` until a later phase splits it per role (decision 2026-09-27).

- **Owner lane:** `zl-commerce` (docs/plan.md §3)
- **API side:** [`backend/app/common/analytics`](../../../backend/app/common/analytics/README.md)

## Public API

Other modules import only what [`index.ts`](index.ts) exports; the reality gate's `module-boundary` rule fails a deep import. Today: `SellerDashboard`, `useDealerAnalytics`, `useExpertAnalytics`, `useFarmerAnalytics`, `fetchAdminAnalytics`.

## Inside

`components/` · `hooks/` · `services/` · `types/`. Tests sit beside the code they test.
