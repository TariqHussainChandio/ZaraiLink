import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { StockOperation } from './inventory';

/** The inventory system's tabs (SRDS §16): its own navigation, apart from the marketplace's. */
export const INVENTORY_TABS = {
  Dashboard: 'InventoryDashboardTab',
  Products: 'InventoryProductsTab',
  Stock: 'InventoryStockTab',
  Reports: 'InventoryReportsTab',
  More: 'InventoryMoreTab',
} as const;

/** Every inventory screen. Each tab's stack starts at its own root and can push any of the others, so they share one
 * param list (as the admin's stacks do). */
export const INVENTORY_ROUTES = {
  Dashboard: 'InventoryDashboard',
  Products: 'InventoryProducts',
  Stock: 'InventoryStock',
  Reports: 'InventoryReports',
  More: 'InventoryMore',
  ProductDetail: 'InventoryProductDetail',
  ProductForm: 'InventoryProductForm',
  Operation: 'InventoryOperation',
  Alerts: 'InventoryAlerts',
  Movements: 'InventoryMovements',
  Suppliers: 'InventorySuppliers',
  SupplierForm: 'InventorySupplierForm',
  Purchases: 'InventoryPurchases',
  PurchaseForm: 'InventoryPurchaseForm',
  PurchaseDetail: 'InventoryPurchaseDetail',
  Locations: 'InventoryLocations',
  LocationForm: 'InventoryLocationForm',
  AlertSettings: 'InventoryAlertSettings',
  SyncLog: 'InventorySyncLog',
  Reconciliation: 'InventoryReconciliation',
} as const;

export type InventoryStackParamList = {
  [INVENTORY_ROUTES.Dashboard]: undefined;
  [INVENTORY_ROUTES.Products]: undefined;
  [INVENTORY_ROUTES.Stock]: undefined;
  [INVENTORY_ROUTES.Reports]: undefined;
  [INVENTORY_ROUTES.More]: undefined;
  [INVENTORY_ROUTES.ProductDetail]: { productId: string };
  [INVENTORY_ROUTES.ProductForm]: { productId?: string };
  [INVENTORY_ROUTES.Operation]: { operation: StockOperation; productId?: string };
  [INVENTORY_ROUTES.Alerts]: undefined;
  [INVENTORY_ROUTES.Movements]: { productId?: string } | undefined;
  [INVENTORY_ROUTES.Suppliers]: undefined;
  [INVENTORY_ROUTES.SupplierForm]: { supplierId?: string };
  [INVENTORY_ROUTES.Purchases]: undefined;
  [INVENTORY_ROUTES.PurchaseForm]: { purchaseId?: string } | undefined;
  [INVENTORY_ROUTES.PurchaseDetail]: { purchaseId: string };
  [INVENTORY_ROUTES.Locations]: undefined;
  [INVENTORY_ROUTES.LocationForm]: { locationId?: string };
  [INVENTORY_ROUTES.AlertSettings]: undefined;
  [INVENTORY_ROUTES.SyncLog]: undefined;
  [INVENTORY_ROUTES.Reconciliation]: undefined;
};

export type InventoryTabParamList = {
  [INVENTORY_TABS.Dashboard]: undefined;
  [INVENTORY_TABS.Products]: undefined;
  [INVENTORY_TABS.Stock]: undefined;
  [INVENTORY_TABS.Reports]: undefined;
  [INVENTORY_TABS.More]: undefined;
};

export type InventoryScreenProps<RouteName extends keyof InventoryStackParamList> = NativeStackScreenProps<
  InventoryStackParamList,
  RouteName
>;
