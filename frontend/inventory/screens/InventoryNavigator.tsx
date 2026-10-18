import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator, type NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { ChartColumn, Ellipsis, LayoutDashboard, Package, Warehouse } from 'lucide-react-native';
import React from 'react';
import { stackOptionsWithActions } from '../../navigation/stackHeader';
import { renderTabBar, tabOptions } from '../../navigation/tabOptions';
import { InventoryExitProvider } from '../components/InventoryExit';
import { InventoryGate } from '../components/InventoryGate';
import { InventoryShellHeader } from '../components/InventoryShellHeader';
import {
  INVENTORY_ROUTES,
  INVENTORY_TABS,
  type InventoryScreenProps,
  type InventoryStackParamList,
  type InventoryTabParamList,
} from '../types/navigation';
import { AlertSettingsScreen } from './AlertSettingsScreen';
import { AlertsScreen } from './AlertsScreen';
import { DashboardScreen } from './DashboardScreen';
import { LocationFormScreen } from './LocationFormScreen';
import { LocationListScreen } from './LocationListScreen';
import { MoreScreen } from './MoreScreen';
import { MovementsScreen } from './MovementsScreen';
import { OPERATION_TITLES, OperationScreen } from './OperationScreen';
import { ProductDetailScreen } from './ProductDetailScreen';
import { ProductFormScreen } from './ProductFormScreen';
import { ProductListScreen } from './ProductListScreen';
import { PurchaseDetailScreen } from './PurchaseDetailScreen';
import { PurchaseFormScreen } from './PurchaseFormScreen';
import { PurchaseListScreen } from './PurchaseListScreen';
import { ReconciliationScreen } from './ReconciliationScreen';
import { ReportsScreen } from './ReportsScreen';
import { StockScreen } from './StockScreen';
import { SupplierFormScreen } from './SupplierFormScreen';
import { SupplierListScreen } from './SupplierListScreen';
import { SyncLogScreen } from './SyncLogScreen';

const Stack = createNativeStackNavigator<InventoryStackParamList>();
const Tab = createBottomTabNavigator<InventoryTabParamList>();

// Every inner screen draws the stack's app bar in the inventory variant (the dealer band and the system's name), so a
// dealer always knows they are in the separate system (SRDS §16). A tab's first screen draws the shell's own app bar.
const STACK_OPTIONS = stackOptionsWithActions({}, 'inventory');
const renderShellHeader = () => <InventoryShellHeader />;
const ROOT_OPTIONS: NativeStackNavigationOptions = { header: renderShellHeader };

type RootRoute =
  | typeof INVENTORY_ROUTES.Dashboard
  | typeof INVENTORY_ROUTES.Products
  | typeof INVENTORY_ROUTES.Stock
  | typeof INVENTORY_ROUTES.Reports
  | typeof INVENTORY_ROUTES.More;

/** The screens any tab can push: every stack holds them, so a link from the dashboard to a product, or from a
 * product to an operation, stays in the tab it started in and Back returns there. */
function sharedScreens() {
  return (
    <>
      <Stack.Screen name={INVENTORY_ROUTES.ProductDetail} component={ProductDetailScreen} options={{ title: 'Product' }} />
      <Stack.Screen
        name={INVENTORY_ROUTES.ProductForm}
        component={ProductFormScreen}
        options={({ route }) => ({ title: route.params?.productId ? 'Edit product' : 'New product' })}
      />
      <Stack.Screen
        name={INVENTORY_ROUTES.Operation}
        component={OperationScreen}
        options={({ route }) => ({ title: OPERATION_TITLES[route.params.operation] })}
      />
      <Stack.Screen name={INVENTORY_ROUTES.Alerts} component={AlertsScreen} options={{ title: 'Stock alerts' }} />
      <Stack.Screen name={INVENTORY_ROUTES.Movements} component={MovementsScreen} options={{ title: 'Activity history' }} />
      <Stack.Screen name={INVENTORY_ROUTES.Suppliers} component={SupplierListScreen} options={{ title: 'Suppliers' }} />
      <Stack.Screen
        name={INVENTORY_ROUTES.SupplierForm}
        component={SupplierFormScreen}
        options={({ route }) => ({ title: route.params?.supplierId ? 'Edit supplier' : 'New supplier' })}
      />
      <Stack.Screen name={INVENTORY_ROUTES.Purchases} component={PurchaseListScreen} options={{ title: 'Purchases' }} />
      <Stack.Screen
        name={INVENTORY_ROUTES.PurchaseForm}
        component={PurchaseFormScreen}
        options={({ route }) => ({ title: route.params?.purchaseId ? 'Edit purchase' : 'New purchase' })}
      />
      <Stack.Screen name={INVENTORY_ROUTES.PurchaseDetail} component={PurchaseDetailScreen} options={{ title: 'Purchase' }} />
      <Stack.Screen name={INVENTORY_ROUTES.Locations} component={LocationListScreen} options={{ title: 'Locations' }} />
      <Stack.Screen
        name={INVENTORY_ROUTES.LocationForm}
        component={LocationFormScreen}
        options={({ route }) => ({ title: route.params?.locationId ? 'Edit location' : 'New location' })}
      />
      <Stack.Screen name={INVENTORY_ROUTES.AlertSettings} component={AlertSettingsScreen} options={{ title: 'Alert settings' }} />
      <Stack.Screen name={INVENTORY_ROUTES.SyncLog} component={SyncLogScreen} options={{ title: 'Marketplace sync' }} />
      <Stack.Screen
        name={INVENTORY_ROUTES.Reconciliation}
        component={ReconciliationScreen}
        options={{ title: 'Reconciliation' }}
      />
    </>
  );
}

function tabStack<R extends RootRoute>(root: R, component: React.ComponentType<InventoryScreenProps<R>>) {
  function TabStack() {
    return (
      <Stack.Navigator screenOptions={STACK_OPTIONS} initialRouteName={root}>
        <Stack.Screen name={root} component={component} options={ROOT_OPTIONS} />
        {sharedScreens()}
      </Stack.Navigator>
    );
  }
  return TabStack;
}

const DashboardStack = tabStack(INVENTORY_ROUTES.Dashboard, DashboardScreen);
const ProductsStack = tabStack(INVENTORY_ROUTES.Products, ProductListScreen);
const StockStack = tabStack(INVENTORY_ROUTES.Stock, StockScreen);
const ReportsStack = tabStack(INVENTORY_ROUTES.Reports, ReportsScreen);
const MoreStack = tabStack(INVENTORY_ROUTES.More, MoreScreen);

const DASHBOARD_TAB = tabOptions('Dashboard', LayoutDashboard);
const PRODUCTS_TAB = tabOptions('Products', Package);
const STOCK_TAB = tabOptions('Stock', Warehouse);
const REPORTS_TAB = tabOptions('Reports', ChartColumn);
const MORE_TAB = tabOptions('More', Ellipsis);

/**
 * The dealer's Inventory Management System (Plan B, SRDS §15–§18): a separate app inside ZaraiLink with its own tabs,
 * app bar and navigation. The root stack mounts it full-screen for approved dealers only (BR-03/04), and InventoryGate
 * refuses anyone else who reaches it. Leaving it ("Back to ZaraiLink", or system back from a tab's first screen)
 * returns to where the dealer opened it.
 */
export function InventoryNavigator({ navigation }: { navigation: { goBack: () => void } }) {
  return (
    <InventoryGate onExit={navigation.goBack}>
      <InventoryExitProvider onExit={navigation.goBack}>
        <Tab.Navigator tabBar={renderTabBar} screenOptions={{ headerShown: false }} backBehavior="none">
          <Tab.Screen name={INVENTORY_TABS.Dashboard} component={DashboardStack} options={DASHBOARD_TAB} />
          <Tab.Screen name={INVENTORY_TABS.Products} component={ProductsStack} options={PRODUCTS_TAB} />
          <Tab.Screen name={INVENTORY_TABS.Stock} component={StockStack} options={STOCK_TAB} />
          <Tab.Screen name={INVENTORY_TABS.Reports} component={ReportsStack} options={REPORTS_TAB} />
          <Tab.Screen name={INVENTORY_TABS.More} component={MoreStack} options={MORE_TAB} />
        </Tab.Navigator>
      </InventoryExitProvider>
    </InventoryGate>
  );
}
