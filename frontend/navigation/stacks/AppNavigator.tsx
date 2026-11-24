// The signed-in shell for farmers, buyers and dealers: bottom tabs chosen by role.
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { House, LayoutDashboard, MessageCircle, Package, Receipt, ShoppingCart, Sprout, Store, User } from 'lucide-react-native';
import React, { useState } from 'react';
import { APP_TABS } from '../../common/constants/routes';
import type { Role } from '../../common/constants/roles';
import { InventoryNavigator } from '../../inventory';
import { useAuthStore } from '../../state/authStore';
import { useCheckoutIntent } from '../../state/checkoutIntentStore';
import { RoleScopeProvider } from '../../theme';
import { AccountUnavailableScreen } from '../AccountUnavailableScreen';
import { renderLargeTabBar, renderTabBar, tabOptions } from '../tabOptions';
import { CartNavigator } from './CartNavigator';
import { ConsultationsNavigator, type ConsultationsStackParamList } from './ConsultationsNavigator';
import { HomeNavigator, type HomeStackParamList } from './HomeNavigator';
import { MarketplaceNavigator, type MarketplaceStackParamList } from './MarketplaceNavigator';
import { MessagingNavigator, type MessagingStackParamList } from './MessagingNavigator';
import { OrdersNavigator, type OrdersStackParamList } from './OrdersNavigator';
import { ProfileNavigator, type ProfileStackParamList } from './ProfileNavigator';

export type AppTabParamList = {
  [APP_TABS.Home]: NavigatorScreenParams<HomeStackParamList> | undefined;
  [APP_TABS.Marketplace]: NavigatorScreenParams<MarketplaceStackParamList> | undefined;
  [APP_TABS.Orders]: NavigatorScreenParams<OrdersStackParamList> | undefined;
  [APP_TABS.Cart]: NavigatorScreenParams<MarketplaceStackParamList> | undefined;
  [APP_TABS.Consultations]: NavigatorScreenParams<ConsultationsStackParamList> | undefined;
  [APP_TABS.Messages]: NavigatorScreenParams<MessagingStackParamList> | undefined;
  [APP_TABS.Profile]: NavigatorScreenParams<ProfileStackParamList> | undefined;
};

export type MarketRootParamList = {
  Tabs: NavigatorScreenParams<AppTabParamList> | undefined;
  [APP_TABS.Messages]: NavigatorScreenParams<MessagingStackParamList> | undefined;
  // The dealer's private inventory system (Plan B), opened over the tabs; reach it with `useOpenInventorySystem()`.
  InventorySystem: undefined;
};

const Tab = createBottomTabNavigator<AppTabParamList>();

const HOME_TAB = tabOptions('Home', House);
const MARKET_TAB = tabOptions('Market', Store);
const ORDERS_TAB = tabOptions('Orders', Receipt);
const MESSAGES_TAB = tabOptions('Messages', MessageCircle);
// D20: one Account tab, the same word and mark for every role.
const ACCOUNT_TAB = tabOptions('Account', User);
// D20, the buyer: Dashboard · Market · Cart · Orders · Account.
const DASHBOARD_TAB = tabOptions('Dashboard', LayoutDashboard);
const CART_TAB = tabOptions('Cart', ShoppingCart);
// D20, the farmer: plain pictures with short words, drawn large (renderLargeTabBar).
const FARMER_ORDERS_TAB = tabOptions('Orders', Package);
const PLANT_DOCTOR_TAB = tabOptions('AI', Sprout);

const Root = createNativeStackNavigator<MarketRootParamList>();
type MarketRole = Extract<Role, 'farmer' | 'buyer' | 'dealer'>;

// True for the roles that use the marketplace shell (farmer, buyer, dealer).
function isMarketRole(role: Role | null): role is MarketRole {
  return role === 'farmer' || role === 'buyer' || role === 'dealer';
}

// The marketplace roles' shells (the approved design system's "Role shells", revised by D20). Each has its own tabs and
// accent; the route names stay shared so a screen used by several roles navigates the same way in each:
//   Farmer: Home · Market · Orders · AI · Account, drawn large (AI: the disease scan and consultations)
//   Buyer:  Dashboard · Market · Cart · Orders · Account (no experts: advisory is the farmer's alone, D20)
//   Dealer: Home · Market · Orders · Messages · Account (Home carries the inventory system's card)
function MarketTabs({ role }: { role: MarketRole }) {
  // A guest who asked to check out lands on their cart (D18): the buyer's own Cart tab, or Market, where the cart they
  // filled reopens (MarketplaceNavigator).
  const [resumeCheckout] = useState(() => useCheckoutIntent.getState().pending);
  const resumeTab = role === 'buyer' ? APP_TABS.Cart : APP_TABS.Marketplace;
  const farmer = role === 'farmer';
  return (
    <Tab.Navigator
      tabBar={farmer ? renderLargeTabBar : renderTabBar}
      screenOptions={{ headerShown: false }}
      initialRouteName={resumeCheckout ? resumeTab : APP_TABS.Home}
    >
      <Tab.Screen name={APP_TABS.Home} component={HomeNavigator} options={role === 'buyer' ? DASHBOARD_TAB : HOME_TAB} />
      <Tab.Screen name={APP_TABS.Marketplace} component={MarketplaceNavigator} options={MARKET_TAB} />
      {role === 'buyer' ? <Tab.Screen name={APP_TABS.Cart} component={CartNavigator} options={CART_TAB} /> : null}
      <Tab.Screen name={APP_TABS.Orders} component={OrdersNavigator} options={farmer ? FARMER_ORDERS_TAB : ORDERS_TAB} />
      {role === 'dealer' ? <Tab.Screen name={APP_TABS.Messages} component={MessagingNavigator} options={MESSAGES_TAB} /> : null}
      {farmer ? <Tab.Screen name={APP_TABS.Consultations} component={ConsultationsNavigator} options={PLANT_DOCTOR_TAB} /> : null}
      <Tab.Screen
        name={APP_TABS.Profile}
        component={ProfileNavigator}
        options={ACCOUNT_TAB}
      />
    </Tab.Navigator>
  );
}

// Renders the bottom tabs for the signed-in farmer, buyer or dealer.
export function AppNavigator() {
  const role = useAuthStore(state => state.role);
  // RootNavigator mounts this shell only for a marketplace role. There is no default role: a missing one once opened
  // the buyer shell for an approved dealer who started offline (B4 verification, F1).
  if (!isMarketRole(role)) return <AccountUnavailableScreen />;
  return (
    // D20: the dealer's and the buyer's shells are drawn in the brand olive (prices in earth brown); the inventory system
    // sets its own earth brown.
    <RoleScopeProvider scope={role === 'dealer' || role === 'buyer' ? 'brand' : role}>
      <Root.Navigator screenOptions={{ headerShown: false }}>
        <Root.Screen name="Tabs">{() => <MarketTabs role={role} />}</Root.Screen>
        {/* Farmers and buyers reach their conversations from Home's app bar; chat is a full-screen flow over the tabs.
            Screens that start a chat navigate to Messages, which reaches this screen (or the dealer's tab) either way. */}
        {role === 'dealer' ? null : <Root.Screen name={APP_TABS.Messages} component={MessagingNavigator} />}
        {/* The inventory system is dealer-only (BR-03/04): the route does not exist for any other role, so no screen can
            reach it by accident. It is a full-screen flow with its own stack and app bars, hence no root header. */}
        {role === 'dealer' ? <Root.Screen name="InventorySystem" component={InventoryNavigator} /> : null}
      </Root.Navigator>
    </RoleScopeProvider>
  );
}
