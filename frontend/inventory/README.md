# inventory (app)

The dealer's Inventory Management System (Plan B, B4): a separate app inside ZaraiLink with its own tabs (Dashboard,
Products, Stock, Reports, More), its own app bar (business name, location switcher, alert centre, Back to ZaraiLink)
and its own navigation. The root stack mounts it full-screen as `InventorySystem`, for dealers only (BR-03/04).

- **Owner lane:** `zl-inventory-app` (docs/plan.md §3)
- **SRDS:** §15–§25, §41
- **API side:** [`backend/app/inventory`](../../backend/app/inventory/README.md) (`/api/v1/inventory`)

## Public API

`index.ts`: `InventoryNavigator` (mounted by `navigation/stacks/AppNavigator.tsx`) and `inventoryKeys`.

## Inside

- `screens/`: `InventoryNavigator` and one screen per flow (dashboard, products, stock operations, alerts, reports,
  reconciliation, suppliers and purchases, locations, alert settings, activity history, marketplace sync log).
- `components/`: the shell app bar, `QuantityStepper`, `MovementRow`, `MovementHistory` (filters), `ExportButton`,
  the report helpers (`reportRange.ts`: the period presets in UTC days; `reportView.ts`: each B5 report as totals,
  charts and table rows), shared form and format helpers.
- `hooks/`: every read and write (`inventory.ts`), the query keys (`keys.ts`), the offline write guard
  (`mutation.ts`), the selected location (`location.ts`, kept per dealer on the device).
- `services/inventoryService.ts`: the API calls. `types/`: the API types under the system's names, and the routes.

## Offline

Every query key starts with `inventory`, a root the shared query client keeps on the device for 24 hours, so the
system opens offline from the last copy. Writes never queue: offline, they fail at once with "You're offline — this
change wasn't saved." (`hooks/mutation.ts`). Stock changes only through the operations, each one ledger line.
A CSV export (B5) is a write too: offline it fails the same way; online the server returns a short-lived signed link,
which the phone opens with `Linking.openURL`.
