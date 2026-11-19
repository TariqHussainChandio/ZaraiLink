import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { LogIn, Store } from 'lucide-react-native';
import React from 'react';
import { APP_TABS } from '../../common/constants/routes';
import { renderTabBar, tabOptions } from '../tabOptions';
import { AuthNavigator } from './AuthNavigator';
import { MarketplaceNavigator, type MarketplaceStackParamList } from './MarketplaceNavigator';

/**
 * The tabs of someone who is not signed in (D18): the market, open to anyone who installs the app, and sign-in. The
 * tab names are the signed-in shells' own, so the marketplace screens and their app-bar actions (the cart) navigate
 * the same way here; a screen that needs an account sends the guest to the sign-in tab (`useSignInPrompt`).
 */
type GuestTabParamList = {
  [APP_TABS.Marketplace]: NavigatorScreenParams<MarketplaceStackParamList> | undefined;
  [APP_TABS.Profile]: undefined;
};

const Tab = createBottomTabNavigator<GuestTabParamList>();

const MARKET_TAB = tabOptions('Market', Store);
const SIGN_IN_TAB = tabOptions('Sign in', LogIn);

/** No role yet, so the shell draws in the brand accent (RoleScope's default). Browsing reads only public data: the
 * listings, categories, crops and reviews routes accept a request without a token (authorization_policy.json). */
export function GuestNavigator() {
  return (
    <Tab.Navigator tabBar={renderTabBar} screenOptions={{ headerShown: false }}>
      <Tab.Screen name={APP_TABS.Marketplace} component={MarketplaceNavigator} options={MARKET_TAB} />
      <Tab.Screen name={APP_TABS.Profile} component={AuthNavigator} options={SIGN_IN_TAB} />
    </Tab.Navigator>
  );
}
