import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { Home, MessageCircle, Package, ShoppingBag, Stethoscope, User } from 'lucide-react-native';
import React from 'react';
import { APP_TABS } from '../../constants/routes';
import { useAuthStore } from '../../store/authStore';
import { useTheme } from '../../theme';
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

const Tab = createBottomTabNavigator<AppTabParamList>();

// Shared tab shell for Buyer, Farmer, and Dealer (SRDS v4.0 §34). Expert and Admin get their
// own dedicated navigators (ExpertNavigator, AdminNavigator) since their nav trees diverge
// enough (no marketplace/orders for Expert; a long admin-only destination list) that
// squeezing them into this shared tab bar would misrepresent their role's actual nav tree.
export function AppNavigator() {
  const theme = useTheme();
  const role = useAuthStore(state => state.role);
  // Dealer's SRDS nav tree omits Consultations; Buyer and Farmer include it.
  const showConsultations = role === 'buyer' || role === 'farmer';

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.brand.primary,
        tabBarInactiveTintColor: theme.colors.text.secondary,
      }}
    >
      <Tab.Screen
        name={APP_TABS.Home}
        component={HomeNavigator}
        options={{ tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }}
      />
      <Tab.Screen
        name={APP_TABS.Marketplace}
        component={MarketplaceNavigator}
        options={{ tabBarIcon: ({ color, size }) => <ShoppingBag color={color} size={size} /> }}
      />
      <Tab.Screen
        name={APP_TABS.Orders}
        component={OrdersNavigator}
        options={{ tabBarIcon: ({ color, size }) => <Package color={color} size={size} /> }}
      />
      {showConsultations && (
        <Tab.Screen
          name={APP_TABS.Consultations}
          component={ConsultationsNavigator}
          options={{ tabBarIcon: ({ color, size }) => <Stethoscope color={color} size={size} /> }}
        />
      )}
      <Tab.Screen
        name={APP_TABS.Messages}
        component={MessagingNavigator}
        options={{ tabBarIcon: ({ color, size }) => <MessageCircle color={color} size={size} /> }}
      />
      <Tab.Screen
        name={APP_TABS.Profile}
        component={ProfileNavigator}
        options={{ tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }}
      />
    </Tab.Navigator>
  );
}
