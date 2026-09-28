import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { HOME_ROUTES } from '../../common/constants/routes';
import { useAuthStore } from '../../state/authStore';
import { EmptyState } from '../../common/components';
import { HomeDashboardScreen } from '../HomeDashboardScreen';
import { AddCropScreen } from '../../farmer/screens/AddCropScreen';
import { FarmerAnalyticsScreen } from '../../farmer/screens/AnalyticsScreen';
import { CreateFarmScreen } from '../../farmer/screens/CreateFarmScreen';
import { CropListScreen } from '../../farmer/screens/CropListScreen';
import { FarmDetailScreen } from '../../farmer/screens/FarmDetailScreen';
import { FarmListScreen } from '../../farmer/screens/FarmListScreen';
import { DealerAnalyticsScreen } from '../../dealer/screens/AnalyticsScreen';
import { InventoryScreen } from '../../inventory/screens/InventoryScreen';
import { InventoryTransactionScreen } from '../../inventory/screens/InventoryTransactionScreen';
import { StoreDetailScreen } from '../../inventory/screens/StoreDetailScreen';
import { StoreListScreen } from '../../inventory/screens/StoreListScreen';
import { SupplierDetailScreen } from '../../inventory/screens/SupplierDetailScreen';
import { SupplierListScreen } from '../../inventory/screens/SupplierListScreen';
import { NotificationListScreen } from '../../common/notifications/screens/NotificationListScreen';
import { NotificationBellButton } from '../../common/notifications';
import { DiseaseProcessingScreen } from '../../ai/screens/DiseaseProcessingScreen';
import { DiseaseResultScreen } from '../../ai/screens/DiseaseResultScreen';
import { DiseaseUploadScreen } from '../../ai/screens/DiseaseUploadScreen';
import { MyListingsScreen } from '../../common/marketplace/screens/MyListingsScreen';

export type HomeStackParamList = {
  [HOME_ROUTES.Dashboard]: undefined;
  [HOME_ROUTES.Notifications]: undefined;
  [HOME_ROUTES.MyListings]: undefined;
  [HOME_ROUTES.FarmList]: undefined;
  [HOME_ROUTES.FarmDetail]: { farmId: string };
  [HOME_ROUTES.CreateFarm]: undefined;
  [HOME_ROUTES.CropList]: { farmId: string };
  [HOME_ROUTES.AddCrop]: { farmId: string; cropId?: string };
  [HOME_ROUTES.DiseaseAdvisory]: undefined;
  [HOME_ROUTES.DiseaseProcessing]: { imageUri: string; imageFileName: string | null; imageType: string | null; cropId: string | null };
  [HOME_ROUTES.DiseaseResult]: { diseaseCaseId: string };
  [HOME_ROUTES.Products]: undefined;
  [HOME_ROUTES.Stores]: undefined;
  [HOME_ROUTES.StoreDetail]: { storeId?: string };
  [HOME_ROUTES.Suppliers]: undefined;
  [HOME_ROUTES.SupplierDetail]: { supplierId?: string };
  [HOME_ROUTES.Inventory]: undefined;
  [HOME_ROUTES.InventoryTransactions]: { inventoryId: string };
  [HOME_ROUTES.Analytics]: undefined;
};

export type HomeScreenProps<RouteName extends keyof HomeStackParamList> = NativeStackScreenProps<
  HomeStackParamList,
  RouteName
>;

const Stack = createNativeStackNavigator<HomeStackParamList>();

/** Farmer and dealer share this stack, so the Analytics route branches by role at render time.
 * No in-app path reaches this for buyer/expert/admin today (each has its own dashboard/nav
 * tree), but the branch is exhaustive rather than defaulting silently to Farmer, so a future
 * caller can't land here and see the wrong role's analytics without at least a visible signal. */
function RoleAwareAnalyticsScreen() {
  const role = useAuthStore(state => state.role);
  if (role === 'dealer') return <DealerAnalyticsScreen />;
  if (role === 'farmer') return <FarmerAnalyticsScreen />;
  return <EmptyState title="Analytics unavailable" description="Analytics isn't available for this role." />;
}

export function HomeNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: true }}>
      <Stack.Screen
        name={HOME_ROUTES.Dashboard}
        component={HomeDashboardScreen}
        options={({ navigation }) => ({
          title: 'Home',
          headerRight: () => (
            <NotificationBellButton onPress={() => navigation.navigate(HOME_ROUTES.Notifications)} />
          ),
        })}
      />
      <Stack.Screen
        name={HOME_ROUTES.Notifications}
        component={NotificationListScreen}
        options={{ title: 'Notifications' }}
      />
      <Stack.Screen
        name={HOME_ROUTES.MyListings}
        component={MyListingsScreen}
        options={{ title: 'My Listings' }}
      />
      <Stack.Screen
        name={HOME_ROUTES.FarmList}
        component={FarmListScreen}
        options={{ title: 'Farms' }}
      />
      <Stack.Screen
        name={HOME_ROUTES.FarmDetail}
        component={FarmDetailScreen}
        options={{ title: 'Farm' }}
      />
      <Stack.Screen
        name={HOME_ROUTES.CreateFarm}
        component={CreateFarmScreen}
        options={{ title: 'New Farm' }}
      />
      <Stack.Screen
        name={HOME_ROUTES.CropList}
        component={CropListScreen}
        options={{ title: 'Crops' }}
      />
      <Stack.Screen
        name={HOME_ROUTES.AddCrop}
        component={AddCropScreen}
        options={({ route }) => ({ title: route.params.cropId ? 'Edit Crop' : 'Add Crop' })}
      />
      <Stack.Screen
        name={HOME_ROUTES.DiseaseAdvisory}
        component={DiseaseUploadScreen}
        options={{ title: 'Disease Advisory' }}
      />
      <Stack.Screen
        name={HOME_ROUTES.DiseaseProcessing}
        component={DiseaseProcessingScreen}
        options={{ title: 'Analyzing', headerBackVisible: false }}
      />
      <Stack.Screen
        name={HOME_ROUTES.DiseaseResult}
        component={DiseaseResultScreen}
        options={{ title: 'Advisory Result' }}
      />
      <Stack.Screen
        name={HOME_ROUTES.Products}
        component={MyListingsScreen}
        options={{ title: 'Products' }}
      />
      <Stack.Screen name={HOME_ROUTES.Stores} component={StoreListScreen} options={{ title: 'Stores' }} />
      <Stack.Screen
        name={HOME_ROUTES.StoreDetail}
        component={StoreDetailScreen}
        options={({ route }) => ({ title: route.params?.storeId ? 'Edit Store' : 'New Store' })}
      />
      <Stack.Screen
        name={HOME_ROUTES.Suppliers}
        component={SupplierListScreen}
        options={{ title: 'Suppliers' }}
      />
      <Stack.Screen
        name={HOME_ROUTES.SupplierDetail}
        component={SupplierDetailScreen}
        options={({ route }) => ({ title: route.params?.supplierId ? 'Edit Supplier' : 'New Supplier' })}
      />
      <Stack.Screen
        name={HOME_ROUTES.Inventory}
        component={InventoryScreen}
        options={{ title: 'Inventory' }}
      />
      <Stack.Screen
        name={HOME_ROUTES.InventoryTransactions}
        component={InventoryTransactionScreen}
        options={{ title: 'Stock History' }}
      />
      <Stack.Screen
        name={HOME_ROUTES.Analytics}
        component={RoleAwareAnalyticsScreen}
        options={{ title: 'Analytics' }}
      />
    </Stack.Navigator>
  );
}
