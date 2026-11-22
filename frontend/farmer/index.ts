// Public entry point of frontend/farmer (A1, docs/plan.md §1 rule 4): other modules import only what is
// listed here: what the other modules use, nothing more.
export { useFarms } from './hooks/farmer';
export { fetchFarmerProfile, upsertFarmerProfile } from './services/farmService';
