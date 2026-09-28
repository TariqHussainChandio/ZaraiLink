# common/marketplace (app)

Listings: browse and search, detail, create, edit and the seller's own listings; categories and crops.

- **Owner lane:** `zl-commerce` (docs/plan.md §3)
- **SRDS:** §26–§29
- **API side:** [`backend/app/common/marketplace`](../../../backend/app/common/marketplace/README.md)

## Public API

Other modules import only what [`index.ts`](index.ts) exports; the reality gate's `module-boundary` rule fails a deep import. Today: `useCategories`, `useCrops`, `useListingOptions`, `useRelatedListings`, `createCategory`, `deleteCategory`, `fetchAllListingsForModeration`, `fetchListingById`, `updateCategory`, `updateListingStatus`, `CategoryInput`, `FetchListingsParams`, `Category`, `ListingStatus`, `ListingWithRelations`.

## Inside

`components/` · `hooks/` · `screens/` (5) · `services/` · `types/`. Tests sit beside the code they test.
