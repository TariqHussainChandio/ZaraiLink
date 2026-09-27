import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { MARKETPLACE_ROUTES } from '../../constants/routes';
import { BrowseScreen } from '../../screens/marketplace/BrowseScreen';
import { CartScreen } from '../../screens/orders/CartScreen';
import { CheckoutScreen } from '../../screens/orders/CheckoutScreen';
import { CreateListingScreen } from '../../screens/marketplace/CreateListingScreen';
import { EditListingScreen } from '../../screens/marketplace/EditListingScreen';
import { ListingDetailScreen } from '../../screens/marketplace/ListingDetailScreen';

export type MarketplaceStackParamList = {
  [MARKETPLACE_ROUTES.Browse]: undefined;
  [MARKETPLACE_ROUTES.ListingDetail]: { listingId: string };
  [MARKETPLACE_ROUTES.CreateListing]: undefined;
  [MARKETPLACE_ROUTES.EditListing]: { listingId: string };
  [MARKETPLACE_ROUTES.Cart]: undefined;
  [MARKETPLACE_ROUTES.Checkout]: undefined;
};

export type MarketplaceScreenProps<RouteName extends keyof MarketplaceStackParamList> =
  NativeStackScreenProps<MarketplaceStackParamList, RouteName>;

const Stack = createNativeStackNavigator<MarketplaceStackParamList>();

export function MarketplaceNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: true }}>
      <Stack.Screen
        name={MARKETPLACE_ROUTES.Browse}
        component={BrowseScreen}
        options={{ title: 'Marketplace' }}
      />
      <Stack.Screen
        name={MARKETPLACE_ROUTES.ListingDetail}
        component={ListingDetailScreen}
        options={{ title: 'Listing' }}
      />
      <Stack.Screen
        name={MARKETPLACE_ROUTES.CreateListing}
        component={CreateListingScreen}
        options={{ title: 'New Listing' }}
      />
      <Stack.Screen
        name={MARKETPLACE_ROUTES.EditListing}
        component={EditListingScreen}
        options={{ title: 'Edit Listing' }}
      />
      <Stack.Screen name={MARKETPLACE_ROUTES.Cart} component={CartScreen} options={{ title: 'Cart' }} />
      <Stack.Screen
        name={MARKETPLACE_ROUTES.Checkout}
        component={CheckoutScreen}
        options={{ title: 'Checkout' }}
      />
    </Stack.Navigator>
  );
}
