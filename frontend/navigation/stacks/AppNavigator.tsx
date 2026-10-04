import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { House, MessageCircle, Receipt, ScanLine, Stethoscope, Store, User } from 'lucide-react-native';
import React from 'react';
import { APP_TABS } from '../../common/constants/routes';
import type { Role } from '../../common/constants/roles';
import { useAuthStore } from '../../state/authStore';
import { RoleScopeProvider } from '../../theme';
import { renderTabBar, tabOptions } from '../tabOptions';
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
  [APP_TABS.Consultations]: NavigatorScreenParams<ConsultationsStackParamList> | undefined;
  [APP_TABS.Messages]: NavigatorScreenParams<MessagingStackParamList> | undefined;
  [APP_TABS.Profile]: NavigatorScreenParams<ProfileStackParamList> | undefined;
};

type MarketRootParamList = {
  Tabs: undefined;
  [APP_TABS.Messages]: NavigatorScreenParams<MessagingStackParamList> | undefined;
};

const Tab = createBottomTabNavigator<AppTabParamList>();

const HOME_TAB = tabOptions('Home', House);
const MARKET_TAB = tabOptions('Market', Store);
const ORDERS_TAB = tabOptions('Orders', Receipt);
const MESSAGES_TAB = tabOptions('Messages', MessageCircle);
const ADVISORY_TAB = tabOptions('Advisory', ScanLine);
const EXPERTS_TAB = tabOptions('Experts', Stethoscope);
const ACCOUNT_TAB = tabOptions('Account', User);

const Root = createNativeStackNavigator<MarketRootParamList>();
type MarketRole = Extract<Role, 'farmer' | 'buyer' | 'dealer'>;

// The marketplace roles' shells (the approved design system's "Role shells"). Each has its own tabs and accent; the
// route names stay shared so a screen used by several roles navigates the same way in each:
//   Farmer: Home · Market · Orders · Advisory · Account (Advisory: consultations, plus the disease scan)
//   Buyer:  Home · Market · Orders · Experts · Account
//   Dealer: Home · Market · Orders · Messages · Account (Home carries the inventory system's card)
function MarketTabs({ role }: { role: MarketRole }) {
  return (
    <Tab.Navigator tabBar={renderTabBar} screenOptions={{ headerShown: false }}>
      <Tab.Screen
        name={APP_TABS.Home}
        component={HomeNavigator}
        options={HOME_TAB}
      />
      <Tab.Screen
        name={APP_TABS.Marketplace}
        component={MarketplaceNavigator}
        options={MARKET_TAB}
      />
      <Tab.Screen
        name={APP_TABS.Orders}
        component={OrdersNavigator}
        options={ORDERS_TAB}
      />
      {role === 'dealer' ? (
        <Tab.Screen
          name={APP_TABS.Messages}
          component={MessagingNavigator}
          options={MESSAGES_TAB}
        />
      ) : (
        <Tab.Screen
          name={APP_TABS.Consultations}
          component={ConsultationsNavigator}
          options={
            role === 'farmer'
              ? ADVISORY_TAB
              : EXPERTS_TAB
          }
        />
      )}
      <Tab.Screen
        name={APP_TABS.Profile}
        component={ProfileNavigator}
        options={ACCOUNT_TAB}
      />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  const role = (useAuthStore(state => state.role) ?? 'buyer') as MarketRole;
  return (
    <RoleScopeProvider scope={role}>
      <Root.Navigator screenOptions={{ headerShown: false }}>
        <Root.Screen name="Tabs">{() => <MarketTabs role={role} />}</Root.Screen>
        {/* Farmers and buyers reach their conversations from Home's app bar; chat is a full-screen flow over the tabs.
            Screens that start a chat navigate to Messages, which reaches this screen (or the dealer's tab) either way. */}
        {role === 'dealer' ? null : <Root.Screen name={APP_TABS.Messages} component={MessagingNavigator} />}
      </Root.Navigator>
    </RoleScopeProvider>
  );
}
