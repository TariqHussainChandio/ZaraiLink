import type { MovementFilters, PeriodReportName, PurchaseStatus, ReportRange } from '../types/inventory';

/**
 * Every query key of the inventory system. They all start with 'inventory', the root the shared query client writes to
 * the device (PERSISTED_ROOTS in frontend/hooks/queryClient.ts), so the system opens offline from the last copy, and
 * one invalidation of `all` refreshes every figure after a stock change.
 */
export const inventoryKeys = {
  all: ['inventory'] as const,
  dashboard: () => ['inventory', 'dashboard'] as const,
  products: () => ['inventory', 'products'] as const,
  product: (id: string) => ['inventory', 'products', id] as const,
  listingOptions: () => ['inventory', 'listing-options'] as const,
  stock: (locationId: string | null) => ['inventory', 'stock', locationId] as const,
  locations: () => ['inventory', 'locations'] as const,
  movements: (filters: MovementFilters) => ['inventory', 'movements', filters] as const,
  suppliers: () => ['inventory', 'suppliers'] as const,
  purchases: (status: PurchaseStatus | null) => ['inventory', 'purchases', status] as const,
  purchase: (id: string) => ['inventory', 'purchase', id] as const,
  alerts: () => ['inventory', 'alerts'] as const,
  alertSettings: () => ['inventory', 'alert-settings'] as const,
  report: (report: PeriodReportName, range: ReportRange) => ['inventory', 'reports', report, range.from, range.to] as const,
  reconciliation: () => ['inventory', 'reports', 'reconciliation'] as const,
  syncLog: () => ['inventory', 'sync-log'] as const,
} as const;
