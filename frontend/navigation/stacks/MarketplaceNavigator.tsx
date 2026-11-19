import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useRef, useState } from 'react';
import { MARKETPLACE_ROUTES } from '../../common/constants/routes';
import { BrowseScreen } from '../../common/marketplace/screens/BrowseScreen';
import { CartScreen } from '../../common/orders/screens/CartScreen';
import { CheckoutScreen } from '../../common/orders/screens/CheckoutScreen';
import { CreateListingScreen } from '../../common/marketplace/screens/CreateListingScreen';
import { EditListingScreen } from '../../common/marketplace/screens/EditListingScreen';
import { ListingDetailScreen } from '../../common/marketplace/screens/ListingDetailScreen';
import { useAuthStore } from '../../state/authStore';
import { useCheckoutIntent } from '../../state/checkoutIntentStore';
import { browseActions, cartAction } from '../headerActions';
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
const MARKET_STACK_OPTIONS = stackOptionsWithActions({
  [MARKETPLACE_ROUTES.Browse]: browseActions,
  [MARKETPLACE_ROUTES.ListingDetail]: cartAction,
});

/**
 * After a guest pressed "Sign in to check out" and then signed in (D18), the signed-in shell opens on this tab and the
 * cart is pushed over Browse once Browse is shown, so Back still reaches the market. Decided once, as this stack mounts:
 * only the signed-in shell's stack takes the wish; the guest's own stack is still mounted for a moment after sign-in and
 * must not take it on its way out.
 */
function useResumeCheckout(): boolean {
  const [resume] = useState(
    () => useAuthStore.getState().status === 'authenticated' && useCheckoutIntent.getState().take(),
  );
  return resume;
}

export function MarketplaceNavigator() {
  const resume = useResumeCheckout();
  const resumed = useRef(false);
  return (
    <Stack.Navigator
      screenOptions={MARKET_STACK_OPTIONS}
      screenListeners={({ navigation, route }) => ({
        focus: () => {
          if (!resume || resumed.current || route.name !== MARKETPLACE_ROUTES.Browse) return;
          resumed.current = true;
          navigation.navigate(MARKETPLACE_ROUTES.Cart);
        },
      })}
    >
      <Stack.Screen
        name={MARKETPLACE_ROUTES.Browse}
        component={BrowseScreen}
        options={{ title: 'Market' }}
      />
      <Stack.Screen
        name={MARKETPLACE_ROUTES.ListingDetail}
        component={ListingDetailScreen}
        options={{ title: 'Listing' }}
      />
      <Stack.Screen
        name={MARKETPLACE_ROUTES.CreateListing}
        component={CreateListingScreen}
        options={{ title: 'New listing' }}
      />
      <Stack.Screen
        name={MARKETPLACE_ROUTES.EditListing}
        component={EditListingScreen}
        options={{ title: 'Edit listing' }}
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
