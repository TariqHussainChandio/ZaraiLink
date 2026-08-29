import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { Home, User } from 'lucide-react-native';
import React from 'react';
import { ADMIN_HOME_ROUTES, ADMIN_TABS } from '../../constants/routes';
import { AdminAnalyticsScreen } from '../../screens/admin/AnalyticsScreen';
import { AuditLogScreen } from '../../screens/admin/AuditLogScreen';
import { CategoryManagementScreen } from '../../screens/admin/CategoryManagementScreen';
import { AdminDashboardScreen } from '../../screens/admin/DashboardScreen';
import { ExpertVerificationScreen } from '../../screens/admin/ExpertVerificationScreen';
import { ListingModerationScreen } from '../../screens/admin/ListingModerationScreen';
import { ReferenceDataScreen } from '../../screens/admin/ReferenceDataScreen';
import { ReportsScreen } from '../../screens/admin/ReportsScreen';
import { UserManagementScreen } from '../../screens/admin/UserManagementScreen';
import { NotificationListScreen } from '../../screens/notifications/NotificationListScreen';
import { NotificationBellButton } from '../../components/features/notifications/NotificationBellButton';
import { PlatformOrdersScreen } from '../../screens/admin/PlatformOrdersScreen';
import { lightTheme } from '../../theme';
import { ProfileNavigator, type ProfileStackParamList } from './ProfileNavigator';

export type AdminHomeStackParamList = {
  [ADMIN_HOME_ROUTES.Dashboard]: undefined;
  [ADMIN_HOME_ROUTES.Analytics]: undefined;
  [ADMIN_HOME_ROUTES.UserManagement]: undefined;
  [ADMIN_HOME_ROUTES.ListingModeration]: undefined;
  [ADMIN_HOME_ROUTES.ExpertVerification]: undefined;
  [ADMIN_HOME_ROUTES.Orders]: undefined;
  [ADMIN_HOME_ROUTES.Reports]: undefined;
  [ADMIN_HOME_ROUTES.Categories]: undefined;
  [ADMIN_HOME_ROUTES.ReferenceData]: undefined;
  [ADMIN_HOME_ROUTES.AuditLogs]: undefined;
  [ADMIN_HOME_ROUTES.Notifications]: undefined;
};

export type AdminHomeScreenProps<RouteName extends keyof AdminHomeStackParamList> =
  NativeStackScreenProps<AdminHomeStackParamList, RouteName>;

const HomeStack = createNativeStackNavigator<AdminHomeStackParamList>();

// Admin's Home tab hosts the dashboard plus every admin destination from SRDS v4.0 §34
// (reached via Quick Actions on the dashboard) rather than spreading them across the tab
// bar — ten bottom tabs would be unusable.
function AdminHomeNavigator() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: true }}>
      <HomeStack.Screen
        name={ADMIN_HOME_ROUTES.Dashboard}
        component={AdminDashboardScreen}
        options={({ navigation }) => ({
          title: 'Admin Dashboard',
          headerRight: () => (
            <NotificationBellButton onPress={() => navigation.navigate(ADMIN_HOME_ROUTES.Notifications)} />
          ),
        })}
      />
      <HomeStack.Screen
        name={ADMIN_HOME_ROUTES.Notifications}
        component={NotificationListScreen}
        options={{ title: 'Notifications' }}
      />
      <HomeStack.Screen
        name={ADMIN_HOME_ROUTES.Analytics}
        component={AdminAnalyticsScreen}
        options={{ title: 'Analytics' }}
      />
      <HomeStack.Screen
        name={ADMIN_HOME_ROUTES.UserManagement}
        component={UserManagementScreen}
        options={{ title: 'Manage Users' }}
      />
      <HomeStack.Screen
        name={ADMIN_HOME_ROUTES.ListingModeration}
        component={ListingModerationScreen}
        options={{ title: 'Moderate Listings' }}
      />
      <HomeStack.Screen
        name={ADMIN_HOME_ROUTES.ExpertVerification}
        component={ExpertVerificationScreen}
        options={{ title: 'Expert Verification' }}
      />
      <HomeStack.Screen
        name={ADMIN_HOME_ROUTES.Orders}
        component={PlatformOrdersScreen}
        options={{ title: 'Orders' }}
      />
      <HomeStack.Screen
        name={ADMIN_HOME_ROUTES.Reports}
        component={ReportsScreen}
        options={{ title: 'Reports' }}
      />
      <HomeStack.Screen
        name={ADMIN_HOME_ROUTES.Categories}
        component={CategoryManagementScreen}
        options={{ title: 'Categories' }}
      />
      <HomeStack.Screen
        name={ADMIN_HOME_ROUTES.ReferenceData}
        component={ReferenceDataScreen}
        options={{ title: 'Reference Data' }}
      />
      <HomeStack.Screen
        name={ADMIN_HOME_ROUTES.AuditLogs}
        component={AuditLogScreen}
        options={{ title: 'Audit Logs' }}
      />
    </HomeStack.Navigator>
  );
}

export type AdminTabParamList = {
  [ADMIN_TABS.Home]: NavigatorScreenParams<AdminHomeStackParamList> | undefined;
  [ADMIN_TABS.Profile]: NavigatorScreenParams<ProfileStackParamList> | undefined;
};

const Tab = createBottomTabNavigator<AdminTabParamList>();

// Dedicated tab shell for the Admin role (SRDS v4.0 §34): Dashboard (with every admin
// destination nested underneath) and Profile (which already hosts Settings).
export function AdminNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: lightTheme.roleColors.admin,
        tabBarInactiveTintColor: lightTheme.colors.neutral.gray400,
      }}
    >
      <Tab.Screen
        name={ADMIN_TABS.Home}
        component={AdminHomeNavigator}
        options={{ tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }}
      />
      <Tab.Screen
        name={ADMIN_TABS.Profile}
        component={ProfileNavigator}
        options={{ tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }}
      />
    </Tab.Navigator>
  );
}
