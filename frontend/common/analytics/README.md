# common/analytics (app)

The numbers on the role dashboards: farmer, dealer, expert and admin analytics hooks. The farmer and dealer homes compose their own sections (`frontend/farmer`, `frontend/dealer`); the shared `SellerDashboard` was removed when they did (A8).

- **Owner lane:** `zl-commerce` (docs/plan.md §3)
- **API side:** [`backend/app/common/analytics`](../../../backend/app/common/analytics/README.md)

## Public API

Other modules import only what [`index.ts`](index.ts) exports; the reality gate's `module-boundary` rule fails a deep import. Today: `useDealerAnalytics`, `useExpertAnalytics`, `useFarmerAnalytics`, `fetchAdminAnalytics`.

## Inside

`components/` · `hooks/` · `services/` · `types/`. Tests sit beside the code they test.
