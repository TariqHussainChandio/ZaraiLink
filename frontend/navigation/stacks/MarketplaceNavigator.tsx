import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { MARKETPLACE_ROUTES } from '../../common/constants/routes';
import { BrowseScreen } from '../../common/marketplace/screens/BrowseScreen';
import { CartScreen } from '../../common/orders/screens/CartScreen';
import { CheckoutScreen } from '../../common/orders/screens/CheckoutScreen';
import { CreateListingScreen } from '../../common/marketplace/screens/CreateListingScreen';
import { EditListingScreen } from '../../common/marketplace/screens/EditListingScreen';
import { ListingDetailScreen } from '../../common/marketplace/screens/ListingDetailScreen';
import { cartAction } from '../headerActions';
import { stackOptionsWithActions } from '../stackHeader';

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
const MARKET_STACK_OPTIONS = stackOptionsWithActions({ [MARKETPLACE_ROUTES.Browse]: cartAction });

export function MarketplaceNavigator() {
  return (
    <Stack.Navigator screenOptions={MARKET_STACK_OPTIONS}>
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
