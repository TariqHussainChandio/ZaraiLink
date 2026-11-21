import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { MARKETPLACE_ROUTES } from '../../common/constants/routes';
import { ListingDetailScreen } from '../../common/marketplace/screens/ListingDetailScreen';
import { SellerProfileScreen } from '../../common/marketplace/screens/SellerProfileScreen';
import { CartScreen } from '../../common/orders/screens/CartScreen';
import { CheckoutScreen } from '../../common/orders/screens/CheckoutScreen';
import { useCheckoutIntent } from '../../state/checkoutIntentStore';
import { homeActions } from '../headerActions';
import { stackOptionsWithActions } from '../stackHeader';
import type { MarketplaceStackParamList } from './MarketplaceNavigator';

// The same screens as the market's cart flow, under the same route names, so CartScreen and CheckoutScreen navigate the
// same way in either stack.
const Stack = createNativeStackNavigator<MarketplaceStackParamList>();

const CART_STACK_OPTIONS = stackOptionsWithActions({ [MARKETPLACE_ROUTES.Cart]: homeActions });

/** The buyer's Cart tab (D20: Dashboard · Market · Cart · Orders · Profile): the cart, checkout, and the listings a cart
 * line opens. The buyer's shell opens on this tab after a guest signed in to check out (AppNavigator), so this stack takes
 * that wish, which the market stack would otherwise take the first time Market opened. */
export function CartNavigator() {
  useState(() => useCheckoutIntent.getState().take());
  return (
    <Stack.Navigator screenOptions={CART_STACK_OPTIONS}>
      <Stack.Screen name={MARKETPLACE_ROUTES.Cart} component={CartScreen} options={{ title: 'Cart' }} />
      <Stack.Screen name={MARKETPLACE_ROUTES.Checkout} component={CheckoutScreen} options={{ title: 'Checkout' }} />
      <Stack.Screen name={MARKETPLACE_ROUTES.ListingDetail} component={ListingDetailScreen} options={{ title: 'Listing' }} />
      <Stack.Screen name={MARKETPLACE_ROUTES.SellerProfile} component={SellerProfileScreen} options={{ title: 'Seller' }} />
    </Stack.Navigator>
  );
}
