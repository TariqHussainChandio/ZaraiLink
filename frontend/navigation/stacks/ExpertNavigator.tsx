import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { Bell, Home, MessageCircle, Stethoscope, User } from 'lucide-react-native';
import React from 'react';
import { EXPERT_HOME_ROUTES, EXPERT_TABS, CONSULTATIONS_ROUTES, NOTIFICATIONS_ROUTES } from '../../constants/routes';
import { ExpertAnalyticsScreen } from '../../screens/expert/AnalyticsScreen';
import { ConsultationDetailScreen } from '../../screens/expert/ConsultationDetailScreen';
import { ConsultationListScreen } from '../../screens/expert/ConsultationListScreen';
import { ExpertApplicationScreen } from '../../screens/expert/ExpertApplicationScreen';
import { ExpertDashboardScreen } from '../../screens/expert/DashboardScreen';
import { NotificationListScreen } from '../../screens/notifications/NotificationListScreen';
import { useUnreadNotificationsCount } from '../../hooks/api/notifications';
import { useTheme } from '../../theme';
import { MessagingNavigator, type MessagingStackParamList } from './MessagingNavigator';
import { ProfileNavigator, type ProfileStackParamList } from './ProfileNavigator';

type ExpertHomeStackParamList = {
  [EXPERT_HOME_ROUTES.Dashboard]: undefined;
  [EXPERT_HOME_ROUTES.ExpertApplication]: undefined;
  [EXPERT_HOME_ROUTES.Analytics]: undefined;
};
const ExpertHomeStack = createNativeStackNavigator<ExpertHomeStackParamList>();

function ExpertHomeNavigator() {
  return (
    <ExpertHomeStack.Navigator screenOptions={{ headerShown: true }}>
      <ExpertHomeStack.Screen
        name={EXPERT_HOME_ROUTES.Dashboard}
        component={ExpertDashboardScreen}
        options={{ title: 'Dashboard' }}
      />
      <ExpertHomeStack.Screen
        name={EXPERT_HOME_ROUTES.ExpertApplication}
        component={ExpertApplicationScreen}
        options={{ title: 'Expert Application' }}
      />
      <ExpertHomeStack.Screen
        name={EXPERT_HOME_ROUTES.Analytics}
        component={ExpertAnalyticsScreen}
        options={{ title: 'Analytics' }}
      />
    </ExpertHomeStack.Navigator>
  );
}

type ExpertConsultationsStackParamList = {
  [CONSULTATIONS_ROUTES.ConsultationList]: undefined;
  [CONSULTATIONS_ROUTES.ConsultationDetail]: { consultationId: string };
};
const ExpertConsultationsStack = createNativeStackNavigator<ExpertConsultationsStackParamList>();

// Expert's own consultations stack only needs `ConsultationList`/`ConsultationDetail` — browsing/
// requesting other experts (the requester-side `ConsultationsNavigator`) doesn't apply here.
function ExpertConsultationsNavigator() {
  return (
    <ExpertConsultationsStack.Navigator screenOptions={{ headerShown: true }}>
      <ExpertConsultationsStack.Screen
        name={CONSULTATIONS_ROUTES.ConsultationList}
        component={ConsultationListScreen}
        options={{ title: 'Consultation Requests' }}
      />
      <ExpertConsultationsStack.Screen
        name={CONSULTATIONS_ROUTES.ConsultationDetail}
        component={ConsultationDetailScreen}
        options={{ title: 'Consultation' }}
      />
    </ExpertConsultationsStack.Navigator>
  );
}

type ExpertNotificationsStackParamList = {
  [NOTIFICATIONS_ROUTES.NotificationList]: undefined;
};
const ExpertNotificationsStack = createNativeStackNavigator<ExpertNotificationsStackParamList>();

function ExpertNotificationsNavigator() {
  return (
    <ExpertNotificationsStack.Navigator screenOptions={{ headerShown: true }}>
      <ExpertNotificationsStack.Screen
        name={NOTIFICATIONS_ROUTES.NotificationList}
        component={NotificationListScreen}
        options={{ title: 'Notifications' }}
      />
    </ExpertNotificationsStack.Navigator>
  );
}

export type ExpertTabParamList = {
  [EXPERT_TABS.Home]: NavigatorScreenParams<ExpertHomeStackParamList> | undefined;
  [EXPERT_TABS.Consultations]: NavigatorScreenParams<ExpertConsultationsStackParamList> | undefined;
  [EXPERT_TABS.Messages]: NavigatorScreenParams<MessagingStackParamList> | undefined;
  [EXPERT_TABS.Notifications]: NavigatorScreenParams<ExpertNotificationsStackParamList> | undefined;
  [EXPERT_TABS.Profile]: NavigatorScreenParams<ProfileStackParamList> | undefined;
};

const Tab = createBottomTabNavigator<ExpertTabParamList>();

// Dedicated tab shell for the Expert role (SRDS v4.0 §34): Dashboard, Consultations,
// Messages, Notifications, Profile — deliberately no Marketplace/Orders tabs.
export function ExpertNavigator() {
  const theme = useTheme();
  const { count: unreadCount } = useUnreadNotificationsCount();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.roleColors.expert,
        tabBarInactiveTintColor: theme.colors.text.secondary,
      }}
    >
      <Tab.Screen
        name={EXPERT_TABS.Home}
        component={ExpertHomeNavigator}
        options={{ tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }}
      />
      <Tab.Screen
        name={EXPERT_TABS.Consultations}
        component={ExpertConsultationsNavigator}
        options={{ tabBarIcon: ({ color, size }) => <Stethoscope color={color} size={size} /> }}
      />
      <Tab.Screen
        name={EXPERT_TABS.Messages}
        component={MessagingNavigator}
        options={{ tabBarIcon: ({ color, size }) => <MessageCircle color={color} size={size} /> }}
      />
      <Tab.Screen
        name={EXPERT_TABS.Notifications}
        component={ExpertNotificationsNavigator}
        options={{
          tabBarIcon: ({ color, size }) => <Bell color={color} size={size} />,
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
        }}
      />
      <Tab.Screen
        name={EXPERT_TABS.Profile}
        component={ProfileNavigator}
        options={{ tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }}
      />
    </Tab.Navigator>
  );
}
