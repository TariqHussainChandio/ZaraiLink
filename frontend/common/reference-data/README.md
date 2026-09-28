# common/reference-data (app)

Reference lists (units, currencies and the rows the admin manages) and the hooks that read and edit them.

- **Owner lane:** `zl-commerce` (docs/plan.md §3)
- **API side:** [`backend/app/common/reference_data`](../../../backend/app/common/reference_data/README.md)

## Public API

Other modules import only what [`index.ts`](index.ts) exports; the reality gate's `module-boundary` rule fails a deep import. Today: `useDeleteRefDataRow`, `useRefDataRows`, `useSaveRefDataRow`, `useUnits`, `RefDataTable`.

## Inside

`hooks/` · `services/`. Tests sit beside the code they test.
