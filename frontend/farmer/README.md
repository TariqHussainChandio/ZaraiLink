# farmer (app)

The farmer's own screens: dashboard (crop-health card, "Needs you"), farms with a crops summary, crop forms, farmer analytics. Selling goes through `common/marketplace` and disease scans through `ai/`.

- **Owner lane:** `zl-farmer` (docs/plan.md §3)
- **SRDS:** §5, §27–§28
- **API side:** [`backend/app/farmer`](../../backend/app/farmer/README.md)

## Public API

Other modules import only what [`index.ts`](index.ts) exports; the reality gate's `module-boundary` rule fails a deep import. Today: `useFarms`, `fetchFarmerProfile`, `upsertFarmerProfile`.

## Inside

`components/` (FarmForm, ChoiceField) · `constants/` (form rules) · `hooks/` · `screens/` (7) · `services/` · `types/`. Tests sit beside the code they test.
