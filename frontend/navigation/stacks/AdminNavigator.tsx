// The admin shell: one stack per admin area, opened from the Overview menu (no bottom bar).
import { type BottomTabNavigationProp, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack';
import { ArrowLeft } from 'lucide-react-native';
import React from 'react';
import { AdminMenuBar } from '../../admin';
import { AiActivityScreen } from '../../admin/screens/AiActivityScreen';
import { AdminAnalyticsScreen } from '../../admin/screens/AnalyticsScreen';
import { ApplicationDetailScreen } from '../../admin/screens/ApplicationDetailScreen';
import { ApprovalsScreen } from '../../admin/screens/ApprovalsScreen';
import { AdminOrderDetailScreen } from '../../admin/screens/AdminOrderDetailScreen';
import { AuditLogScreen } from '../../admin/screens/AuditLogScreen';
import { CategoryManagementScreen } from '../../admin/screens/CategoryManagementScreen';
import { ConsultationModerationDetailScreen } from '../../admin/screens/ConsultationModerationDetailScreen';
import { ConsultationModerationScreen } from '../../admin/screens/ConsultationModerationScreen';
import { AdminDashboardScreen } from '../../admin/screens/DashboardScreen';
import { DiseaseKnowledgeEditScreen } from '../../admin/screens/DiseaseKnowledgeEditScreen';
import { DiseaseKnowledgeScreen } from '../../admin/screens/DiseaseKnowledgeScreen';
import { ListingModerationScreen } from '../../admin/screens/ListingModerationScreen';
import { ModerationScreen } from '../../admin/screens/ModerationScreen';
import { PlatformOrdersScreen } from '../../admin/screens/PlatformOrdersScreen';
import { ReferenceDataScreen } from '../../admin/screens/ReferenceDataScreen';
import { ReportsScreen } from '../../admin/screens/ReportsScreen';
import { RequiredDocumentsScreen } from '../../admin/screens/RequiredDocumentsScreen';
import { ReviewModerationScreen } from '../../admin/screens/ReviewModerationScreen';
import { UserManagementScreen } from '../../admin/screens/UserManagementScreen';
import { ADMIN_HOME_ROUTES, ADMIN_TABS } from '../../common/constants/routes';
import { NotificationListScreen } from '../../common/notifications/screens/NotificationListScreen';
import { IconButton } from '../../common/components';
import { RoleScopeProvider } from '../../theme';
import { notificationsAction, profileAction } from '../headerActions';
import { stackOptionsWithActions } from '../stackHeader';
import { renderNoTabBar } from '../tabOptions';
import { ProfileNavigator, profileStackOptions, type ProfileStackParamList } from './ProfileNavigator';

/** Every admin screen; each admin tab's stack registers the ones it holds. */
type AdminStackParamList = {
  [ADMIN_HOME_ROUTES.Dashboard]: undefined;
  [ADMIN_HOME_ROUTES.Analytics]: undefined;
  [ADMIN_HOME_ROUTES.Notifications]: undefined;
  [ADMIN_HOME_ROUTES.Approvals]: undefined;
  [ADMIN_HOME_ROUTES.ApplicationDetail]: { role: 'dealer' | 'expert'; id: string };
  [ADMIN_HOME_ROUTES.RequiredDocuments]: undefined;
  [ADMIN_HOME_ROUTES.ModerationHub]: undefined;
  // A "Users by role" tile on the Overview opens the list already filtered to that role (D20).
  [ADMIN_HOME_ROUTES.UserManagement]: { role?: 'farmer' | 'buyer' | 'dealer' | 'expert' } | undefined;
  [ADMIN_HOME_ROUTES.ListingModeration]: undefined;
  // A queue tile opens the list filtered to disputed orders (SRDS §14).
  [ADMIN_HOME_ROUTES.Orders]: { status?: 'disputed' } | undefined;
  [ADMIN_HOME_ROUTES.OrderDetail]: { orderId: string };
  [ADMIN_HOME_ROUTES.Reports]: undefined;
  [ADMIN_HOME_ROUTES.Categories]: undefined;
  [ADMIN_HOME_ROUTES.ReferenceData]: undefined;
  [ADMIN_HOME_ROUTES.AuditLogs]: undefined;
  [ADMIN_HOME_ROUTES.AiActivity]: undefined;
  [ADMIN_HOME_ROUTES.DiseaseKnowledge]: undefined;
  [ADMIN_HOME_ROUTES.DiseaseKnowledgeEdit]: { classLabel: string };
  // `stale`: only consultations open for over seven days, the Overview's "Stale consultations" queue.
  [ADMIN_HOME_ROUTES.ConsultationModeration]: { stale?: boolean } | undefined;
  [ADMIN_HOME_ROUTES.ConsultationModerationDetail]: { consultationId: string };
  [ADMIN_HOME_ROUTES.ReviewModeration]: undefined;
};

export type AdminScreenProps<RouteName extends keyof AdminStackParamList> = NativeStackScreenProps<AdminStackParamList, RouteName>;

const Stack = createNativeStackNavigator<AdminStackParamList>();

// D20: the Overview, the admin's home, has their photo and name, the bell, and the Menu button under the bar, from which
// every admin screen opens (there is no bottom bar). Every other area's first screen has only its name and Back to the
// Overview. Inner screens have Back.
const menuBar = () => <AdminMenuBar />;
// App-bar button that returns to the admin Overview tab.
function BackToOverview() {
  const tabs = useNavigation().getParent<BottomTabNavigationProp<AdminTabParamList>>();
  return <IconButton icon={ArrowLeft} label="Back to the Overview" onPress={() => tabs?.navigate(ADMIN_TABS.Home)} />;
}
// Render function for the Back to Overview button.
const backToOverview = () => <BackToOverview />;
// Header options for an admin area's first screen (Overview gets bell, profile and menu).
function adminRootOptions(root: string, home = false) {
  return home
    ? stackOptionsWithActions({ [root]: notificationsAction }, 'marketplace', { [root]: profileAction }, { [root]: menuBar })
    : stackOptionsWithActions({}, 'marketplace', { [root]: backToOverview });
}

// Overview: platform figures, analytics, notifications and the AI module (A6; SRDS §37).
const OVERVIEW_STACK_OPTIONS = adminRootOptions(ADMIN_HOME_ROUTES.Dashboard, true);
const APPROVALS_STACK_OPTIONS = adminRootOptions(ADMIN_HOME_ROUTES.Approvals);
const MODERATION_STACK_OPTIONS = adminRootOptions(ADMIN_HOME_ROUTES.ModerationHub);
const AUDIT_STACK_OPTIONS = adminRootOptions(ADMIN_HOME_ROUTES.AuditLogs);
// The Account has the person's photo and name in the bar (profileHeader), and no bell or Menu bar (D20); Back returns to
// the Overview.
const ACCOUNT_STACK_OPTIONS = profileStackOptions(true);

/** The admin's Account: the shared profile stack, with the admin's app bar and Menu bar on its first screen. */
function AdminProfileNavigator() {
  return <ProfileNavigator screenOptions={ACCOUNT_STACK_OPTIONS} />;
}

// Stack for the Overview tab: dashboard, analytics, notifications and AI screens.
function OverviewNavigator() {
  return (
    <Stack.Navigator screenOptions={OVERVIEW_STACK_OPTIONS}>
      <Stack.Screen
        name={ADMIN_HOME_ROUTES.Dashboard}
        component={AdminDashboardScreen}
        options={{ title: 'Overview', headerLargeTitle: false }}
      />
      <Stack.Screen name={ADMIN_HOME_ROUTES.Analytics} component={AdminAnalyticsScreen} options={{ title: 'Analytics' }} />
      <Stack.Screen name={ADMIN_HOME_ROUTES.Notifications} component={NotificationListScreen} options={{ title: 'Notifications' }} />
      <Stack.Screen name={ADMIN_HOME_ROUTES.AiActivity} component={AiActivityScreen} options={{ title: 'AI activity' }} />
      <Stack.Screen name={ADMIN_HOME_ROUTES.DiseaseKnowledge} component={DiseaseKnowledgeScreen} options={{ title: 'Disease knowledge' }} />
      <Stack.Screen name={ADMIN_HOME_ROUTES.DiseaseKnowledgeEdit} component={DiseaseKnowledgeEditScreen} options={{ title: 'Edit entry' }} />
    </Stack.Navigator>
  );
}

// Approvals (A3b; SRDS §12): dealer and expert applications, each read with its documents before the decision.
function ApprovalsNavigator() {
  return (
    <Stack.Navigator screenOptions={APPROVALS_STACK_OPTIONS}>
      <Stack.Screen name={ADMIN_HOME_ROUTES.Approvals} component={ApprovalsScreen} options={{ title: 'Approvals' }} />
      <Stack.Screen name={ADMIN_HOME_ROUTES.ApplicationDetail} component={ApplicationDetailScreen} options={{ title: 'Application' }} />
      <Stack.Screen name={ADMIN_HOME_ROUTES.RequiredDocuments} component={RequiredDocumentsScreen} options={{ title: 'Required documents' }} />
    </Stack.Navigator>
  );
}

// Moderation: users, listings, reports, orders, consultations, reviews and the admin-managed lists, from one hub (SRDS §14).
function ModerationNavigator() {
  return (
    <Stack.Navigator screenOptions={MODERATION_STACK_OPTIONS}>
      <Stack.Screen name={ADMIN_HOME_ROUTES.ModerationHub} component={ModerationScreen} options={{ title: 'Moderation' }} />
      <Stack.Screen name={ADMIN_HOME_ROUTES.UserManagement} component={UserManagementScreen} options={{ title: 'Users' }} />
      <Stack.Screen name={ADMIN_HOME_ROUTES.ListingModeration} component={ListingModerationScreen} options={{ title: 'Listings' }} />
      <Stack.Screen name={ADMIN_HOME_ROUTES.Reports} component={ReportsScreen} options={{ title: 'Reports' }} />
      <Stack.Screen name={ADMIN_HOME_ROUTES.Orders} component={PlatformOrdersScreen} options={{ title: 'Orders' }} />
      <Stack.Screen name={ADMIN_HOME_ROUTES.OrderDetail} component={AdminOrderDetailScreen} options={{ title: 'Order' }} />
      <Stack.Screen name={ADMIN_HOME_ROUTES.ConsultationModeration} component={ConsultationModerationScreen} options={{ title: 'Consultations' }} />
      <Stack.Screen
        name={ADMIN_HOME_ROUTES.ConsultationModerationDetail}
        component={ConsultationModerationDetailScreen}
        options={{ title: 'Consultation' }}
      />
      <Stack.Screen name={ADMIN_HOME_ROUTES.ReviewModeration} component={ReviewModerationScreen} options={{ title: 'Reviews' }} />
      <Stack.Screen name={ADMIN_HOME_ROUTES.Categories} component={CategoryManagementScreen} options={{ title: 'Categories' }} />
      <Stack.Screen name={ADMIN_HOME_ROUTES.ReferenceData} component={ReferenceDataScreen} options={{ title: 'Reference data' }} />
    </Stack.Navigator>
  );
}

// Audit: every admin action, logged (BR-15).
function AuditNavigator() {
  return (
    <Stack.Navigator screenOptions={AUDIT_STACK_OPTIONS}>
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

// The admin's shell: Overview · Approvals · Moderation · Audit · Account, in the admin slate. Since D20 the areas have no
// bottom bar; the Menu bar under each area's app bar (AdminMenu) reaches every admin screen. They stay tabs, so each area
// keeps its own stack and Back, and the menu's links (navigateInTab) work as before.
export function AdminNavigator() {
  return (
    <RoleScopeProvider scope="admin">
      <Tab.Navigator tabBar={renderNoTabBar} screenOptions={{ headerShown: false }}>
        <Tab.Screen
          name={ADMIN_TABS.Home}
          component={OverviewNavigator}
          options={{ title: 'Overview' }}
        />
        <Tab.Screen
          name={ADMIN_TABS.Approvals}
          component={ApprovalsNavigator}
          options={{ title: 'Approvals' }}
        />
        <Tab.Screen
          name={ADMIN_TABS.Moderation}
          component={ModerationNavigator}
          options={{ title: 'Moderation' }}
        />
        <Tab.Screen
          name={ADMIN_TABS.Audit}
          component={AuditNavigator}
          options={{ title: 'Audit' }}
        />
        <Tab.Screen
          name={ADMIN_TABS.Profile}
          component={AdminProfileNavigator}
          options={{ title: 'Account' }}
        />
      </Tab.Navigator>
    </RoleScopeProvider>
  );
}
