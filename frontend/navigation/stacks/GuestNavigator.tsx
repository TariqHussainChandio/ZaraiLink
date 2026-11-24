// The guest shell: browse the market without an account, with sign-in as a tab.
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { NavigatorScreenParams } from '@react-navigation/native';
import React from 'react';
import { APP_TABS, GUEST_SIGN_IN_TAB } from '../../common/constants/routes';
import { renderNoTabBar } from '../tabOptions';
import { AuthNavigator } from './AuthNavigator';
import { MarketplaceNavigator, type MarketplaceStackParamList } from './MarketplaceNavigator';

/**
 * The shell of someone who is not signed in (D18): the market, open to anyone who installs the app, and sign-in. Since
 * D20 there is no bottom bar: the Market's app bar has the profile button (top left, which opens the welcome page with
 * Sign up and Log in) and the cart (top right). It is still a tab navigator with the signed-in shells' tab names, so the
 * marketplace screens and their app-bar actions navigate the same way here, and a screen that needs an account sends the
 * guest to sign-in (`useSignInPrompt`).
 */
type GuestTabParamList = {
  [APP_TABS.Marketplace]: NavigatorScreenParams<MarketplaceStackParamList> | undefined;
  [GUEST_SIGN_IN_TAB]: undefined;
};

const Tab = createBottomTabNavigator<GuestTabParamList>();


/** No role yet, so the shell draws in the brand accent (RoleScope's default). Browsing reads only public data: the
 * listings, categories, crops and reviews routes accept a request without a token (authorization_policy.json). */
export function GuestNavigator() {
  return (
    <Tab.Navigator tabBar={renderNoTabBar} screenOptions={{ headerShown: false }}>
      <Tab.Screen name={APP_TABS.Marketplace} component={MarketplaceNavigator} options={{ title: 'Market' }} />
      <Tab.Screen name={GUEST_SIGN_IN_TAB} component={AuthNavigator} options={{ title: 'Account' }} />
    </Tab.Navigator>
  );
}
