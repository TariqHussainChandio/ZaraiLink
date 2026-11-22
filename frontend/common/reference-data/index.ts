// Public entry point of frontend/common/reference-data (A1, docs/plan.md §1 rule 4): other modules import only what is
// listed here: what the other modules use, nothing more.
export { useDeleteRefDataRow, useRefDataRows, useSaveRefDataRow, useUnits } from './hooks/referenceData';
export type { RefDataTable } from './hooks/referenceData';
