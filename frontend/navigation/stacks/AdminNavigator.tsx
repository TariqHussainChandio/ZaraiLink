import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack';
import { BadgeCheck, Flag, LayoutDashboard, ScrollText, User } from 'lucide-react-native';
import React from 'react';
import { AdminAnalyticsScreen } from '../../admin/screens/AnalyticsScreen';
import { AuditLogScreen } from '../../admin/screens/AuditLogScreen';
import { CategoryManagementScreen } from '../../admin/screens/CategoryManagementScreen';
import { AdminDashboardScreen } from '../../admin/screens/DashboardScreen';
import { ExpertVerificationScreen } from '../../admin/screens/ExpertVerificationScreen';
import { ListingModerationScreen } from '../../admin/screens/ListingModerationScreen';
import { ModerationScreen } from '../../admin/screens/ModerationScreen';
import { PlatformOrdersScreen } from '../../admin/screens/PlatformOrdersScreen';
import { ReferenceDataScreen } from '../../admin/screens/ReferenceDataScreen';
import { ReportsScreen } from '../../admin/screens/ReportsScreen';
import { UserManagementScreen } from '../../admin/screens/UserManagementScreen';
import { ADMIN_HOME_ROUTES, ADMIN_TABS } from '../../common/constants/routes';
import { NotificationListScreen } from '../../common/notifications/screens/NotificationListScreen';
import { OrderDetailScreen } from '../../common/orders/screens/OrderDetailScreen';
import { RoleScopeProvider } from '../../theme';
import { notificationsAction } from '../headerActions';
import { stackOptionsWithActions, stackScreenOptions } from '../stackHeader';
import { renderTabBar, tabOptions } from '../tabOptions';
import { ProfileNavigator, type ProfileStackParamList } from './ProfileNavigator';

/** Every admin screen; each admin tab's stack registers the ones it holds. */
export type AdminStackParamList = {
  [ADMIN_HOME_ROUTES.Dashboard]: undefined;
  [ADMIN_HOME_ROUTES.Analytics]: undefined;
  [ADMIN_HOME_ROUTES.Notifications]: undefined;
  [ADMIN_HOME_ROUTES.ExpertVerification]: undefined;
  [ADMIN_HOME_ROUTES.ModerationHub]: undefined;
  [ADMIN_HOME_ROUTES.UserManagement]: undefined;
  [ADMIN_HOME_ROUTES.ListingModeration]: undefined;
  [ADMIN_HOME_ROUTES.Orders]: undefined;
  [ADMIN_HOME_ROUTES.OrderDetail]: { orderId: string };
  [ADMIN_HOME_ROUTES.Reports]: undefined;
  [ADMIN_HOME_ROUTES.Categories]: undefined;
  [ADMIN_HOME_ROUTES.ReferenceData]: undefined;
  [ADMIN_HOME_ROUTES.AuditLogs]: undefined;
};

export type AdminScreenProps<RouteName extends keyof AdminStackParamList> = NativeStackScreenProps<AdminStackParamList, RouteName>;

const Stack = createNativeStackNavigator<AdminStackParamList>();

// Overview: platform figures, analytics and notifications.
const OVERVIEW_STACK_OPTIONS = stackOptionsWithActions({ [ADMIN_HOME_ROUTES.Dashboard]: notificationsAction });

function OverviewNavigator() {
  return (
    <Stack.Navigator screenOptions={OVERVIEW_STACK_OPTIONS}>
      <Stack.Screen
        name={ADMIN_HOME_ROUTES.Dashboard}
        component={AdminDashboardScreen}
        options={{ title: 'Overview' }}
      />
      <Stack.Screen name={ADMIN_HOME_ROUTES.Analytics} component={AdminAnalyticsScreen} options={{ title: 'Analytics' }} />
      <Stack.Screen name={ADMIN_HOME_ROUTES.Notifications} component={NotificationListScreen} options={{ title: 'Notifications' }} />
    </Stack.Navigator>
  );
}

// Approvals: expert applications today; dealer applications join in A3.
function ApprovalsNavigator() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name={ADMIN_HOME_ROUTES.ExpertVerification} component={ExpertVerificationScreen} options={{ title: 'Approvals' }} />
    </Stack.Navigator>
  );
}

// Moderation: users, listings, reports, orders and the admin-managed lists, from one hub.
function ModerationNavigator() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name={ADMIN_HOME_ROUTES.ModerationHub} component={ModerationScreen} options={{ title: 'Moderation' }} />
      <Stack.Screen name={ADMIN_HOME_ROUTES.UserManagement} component={UserManagementScreen} options={{ title: 'Users' }} />
      <Stack.Screen name={ADMIN_HOME_ROUTES.ListingModeration} component={ListingModerationScreen} options={{ title: 'Listings' }} />
      <Stack.Screen name={ADMIN_HOME_ROUTES.Reports} component={ReportsScreen} options={{ title: 'Reports' }} />
      <Stack.Screen name={ADMIN_HOME_ROUTES.Orders} component={PlatformOrdersScreen} options={{ title: 'Orders' }} />
      <Stack.Screen name={ADMIN_HOME_ROUTES.OrderDetail} component={OrderDetailScreen} options={{ title: 'Order' }} />
      <Stack.Screen name={ADMIN_HOME_ROUTES.Categories} component={CategoryManagementScreen} options={{ title: 'Categories' }} />
      <Stack.Screen name={ADMIN_HOME_ROUTES.ReferenceData} component={ReferenceDataScreen} options={{ title: 'Reference data' }} />
    </Stack.Navigator>
  );
}

// Audit: every admin action, logged (BR-15).
function AuditNavigator() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen name={ADMIN_HOME_ROUTES.AuditLogs} component={AuditLogScreen} options={{ title: 'Audit' }} />
    </Stack.Navigator>
  );
}

export type AdminTabParamList = {
  [ADMIN_TABS.Home]: NavigatorScreenParams<AdminStackParamList> | undefined;
  [ADMIN_TABS.Approvals]: NavigatorScreenParams<AdminStackParamList> | undefined;
  [ADMIN_TABS.Moderation]: NavigatorScreenParams<AdminStackParamList> | undefined;
  [ADMIN_TABS.Audit]: NavigatorScreenParams<AdminStackParamList> | undefined;
  [ADMIN_TABS.Profile]: NavigatorScreenParams<ProfileStackParamList> | undefined;
};

const Tab = createBottomTabNavigator<AdminTabParamList>();

const OVERVIEW_TAB = tabOptions('Overview', LayoutDashboard);
const APPROVALS_TAB = tabOptions('Approvals', BadgeCheck);
const MODERATION_TAB = tabOptions('Moderation', Flag);
const AUDIT_TAB = tabOptions('Audit', ScrollText);
const ACCOUNT_TAB = tabOptions('Account', User);

// The admin's shell (the approved design system's "Role shells"): Overview · Approvals · Moderation · Audit · Account, in
// the admin slate.
export function AdminNavigator() {
  return (
    <RoleScopeProvider scope="admin">
      <Tab.Navigator tabBar={renderTabBar} screenOptions={{ headerShown: false }}>
        <Tab.Screen
          name={ADMIN_TABS.Home}
          component={OverviewNavigator}
          options={OVERVIEW_TAB}
        />
        <Tab.Screen
          name={ADMIN_TABS.Approvals}
          component={ApprovalsNavigator}
          options={APPROVALS_TAB}
        />
        <Tab.Screen
          name={ADMIN_TABS.Moderation}
          component={ModerationNavigator}
          options={MODERATION_TAB}
        />
        <Tab.Screen
          name={ADMIN_TABS.Audit}
          component={AuditNavigator}
          options={AUDIT_TAB}
        />
        <Tab.Screen
          name={ADMIN_TABS.Profile}
          component={ProfileNavigator}
          options={ACCOUNT_TAB}
        />
      </Tab.Navigator>
    </RoleScopeProvider>
  );
}
