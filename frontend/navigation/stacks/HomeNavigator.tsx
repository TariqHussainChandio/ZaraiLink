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
import { BusinessDetailsScreen } from '../../dealer/screens/BusinessDetailsScreen';
import { NotificationListScreen } from '../../common/notifications/screens/NotificationListScreen';
import { DiseaseProcessingScreen } from '../../ai/screens/DiseaseProcessingScreen';
import { DiseaseResultScreen } from '../../ai/screens/DiseaseResultScreen';
import { DiseaseUploadScreen } from '../../ai/screens/DiseaseUploadScreen';
import { MyListingsScreen } from '../../common/marketplace/screens/MyListingsScreen';
import { homeActions } from '../headerActions';
import { stackOptionsWithActions } from '../stackHeader';

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
  [HOME_ROUTES.BusinessDetails]: undefined;
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

const HOME_STACK_OPTIONS = stackOptionsWithActions({ [HOME_ROUTES.Dashboard]: homeActions });

export function HomeNavigator() {
  return (
    <Stack.Navigator screenOptions={HOME_STACK_OPTIONS}>
      <Stack.Screen
        name={HOME_ROUTES.Dashboard}
        component={HomeDashboardScreen}
        options={{ title: 'Home' }}
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
        // The dealer's marketplace listings. "Products" belongs to the inventory system's catalogue, one tile below on
        // the dealer's Home; two different "Products" confused dealers (B4 verification).
        options={{ title: 'My Listings' }}
      />
      <Stack.Screen name={HOME_ROUTES.BusinessDetails} component={BusinessDetailsScreen} options={{ title: 'Business details' }} />
      <Stack.Screen
        name={HOME_ROUTES.Analytics}
        component={RoleAwareAnalyticsScreen}
        options={{ title: 'Analytics' }}
      />
    </Stack.Navigator>
  );
}
