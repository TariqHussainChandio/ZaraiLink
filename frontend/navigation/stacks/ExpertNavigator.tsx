import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { Inbox, MessageCircle, Stethoscope, User } from 'lucide-react-native';
import React from 'react';
import { CONSULTATIONS_ROUTES, EXPERT_HOME_ROUTES, EXPERT_TABS } from '../../common/constants/routes';
import { ConsultationDetailScreen } from '../../common/consultations/screens/ConsultationDetailScreen';
import { ConsultationListScreen } from '../../common/consultations/screens/ConsultationListScreen';
import { NotificationListScreen } from '../../common/notifications/screens/NotificationListScreen';
import { ExpertAnalyticsScreen } from '../../expert/screens/AnalyticsScreen';
import { ExpertDashboardScreen } from '../../expert/screens/DashboardScreen';
import { ExpertApplicationScreen } from '../../expert/screens/ExpertApplicationScreen';
import { RoleScopeProvider } from '../../theme';
import { notificationsAction } from '../headerActions';
import { stackOptionsWithActions, stackScreenOptions } from '../stackHeader';
import { renderTabBar, tabOptions } from '../tabOptions';
import { MessagingNavigator, type MessagingStackParamList } from './MessagingNavigator';
import { ProfileNavigator, type ProfileStackParamList } from './ProfileNavigator';

type ExpertHomeStackParamList = {
  [EXPERT_HOME_ROUTES.Dashboard]: undefined;
  [EXPERT_HOME_ROUTES.ExpertApplication]: undefined;
  [EXPERT_HOME_ROUTES.Analytics]: undefined;
  [EXPERT_HOME_ROUTES.Notifications]: undefined;
};

const ExpertHomeStack = createNativeStackNavigator<ExpertHomeStackParamList>();
const REQUESTS_STACK_OPTIONS = stackOptionsWithActions({ [EXPERT_HOME_ROUTES.Dashboard]: notificationsAction });

// Requests: the expert's dashboard of new consultation requests, with the notification bell in its app bar.
function ExpertHomeNavigator() {
  return (
    <ExpertHomeStack.Navigator screenOptions={REQUESTS_STACK_OPTIONS}>
      <ExpertHomeStack.Screen
        name={EXPERT_HOME_ROUTES.Dashboard}
        component={ExpertDashboardScreen}
        options={{ title: 'Requests' }}
      />
      <ExpertHomeStack.Screen name={EXPERT_HOME_ROUTES.Notifications} component={NotificationListScreen} options={{ title: 'Notifications' }} />
      <ExpertHomeStack.Screen
        name={EXPERT_HOME_ROUTES.ExpertApplication}
        component={ExpertApplicationScreen}
        options={{ title: 'Expert application' }}
      />
      <ExpertHomeStack.Screen name={EXPERT_HOME_ROUTES.Analytics} component={ExpertAnalyticsScreen} options={{ title: 'Analytics' }} />
    </ExpertHomeStack.Navigator>
  );
}

type ExpertConsultationsStackParamList = {
  [CONSULTATIONS_ROUTES.ConsultationList]: undefined;
  [CONSULTATIONS_ROUTES.ConsultationDetail]: { consultationId: string; aiSuggestion?: { label: string; confidence: number } };
};

const ExpertConsultationsStack = createNativeStackNavigator<ExpertConsultationsStackParamList>();

// Cases: the expert's consultations. Browsing and requesting experts (the requester's ConsultationsNavigator) does not
// apply to an expert.
function ExpertConsultationsNavigator() {
  return (
    <ExpertConsultationsStack.Navigator screenOptions={stackScreenOptions}>
      <ExpertConsultationsStack.Screen
        name={CONSULTATIONS_ROUTES.ConsultationList}
        component={ConsultationListScreen}
        options={{ title: 'Cases' }}
      />
      <ExpertConsultationsStack.Screen
        name={CONSULTATIONS_ROUTES.ConsultationDetail}
        component={ConsultationDetailScreen}
        // The case is named by its AI suggestion when it came from a plant scan; otherwise it is simply a case.
        options={({ route }) => ({ title: route.params.aiSuggestion?.label ?? 'Case' })}
      />
    </ExpertConsultationsStack.Navigator>
  );
}

type ExpertTabParamList = {
  [EXPERT_TABS.Home]: NavigatorScreenParams<ExpertHomeStackParamList> | undefined;
  [EXPERT_TABS.Consultations]: NavigatorScreenParams<ExpertConsultationsStackParamList> | undefined;
  [EXPERT_TABS.Messages]: NavigatorScreenParams<MessagingStackParamList> | undefined;
  [EXPERT_TABS.Profile]: NavigatorScreenParams<ProfileStackParamList> | undefined;
};

const Tab = createBottomTabNavigator<ExpertTabParamList>();

const REQUESTS_TAB = tabOptions('Requests', Inbox);
const CASES_TAB = tabOptions('Cases', Stethoscope);
const MESSAGES_TAB = tabOptions('Messages', MessageCircle);
const ACCOUNT_TAB = tabOptions('Account', User);

// The expert's shell (the approved design system's "Role shells"): Requests · Cases · Messages · Account, in the expert
// accent. No Market or Orders: experts advise, they do not buy or sell.
export function ExpertNavigator() {
  return (
    <RoleScopeProvider scope="expert">
      <Tab.Navigator tabBar={renderTabBar} screenOptions={{ headerShown: false }}>
        <Tab.Screen
          name={EXPERT_TABS.Home}
          component={ExpertHomeNavigator}
          options={REQUESTS_TAB}
        />
        <Tab.Screen
          name={EXPERT_TABS.Consultations}
          component={ExpertConsultationsNavigator}
          options={CASES_TAB}
        />
        <Tab.Screen
          name={EXPERT_TABS.Messages}
          component={MessagingNavigator}
          options={MESSAGES_TAB}
        />
        <Tab.Screen
          name={EXPERT_TABS.Profile}
          component={ProfileNavigator}
          options={ACCOUNT_TAB}
        />
      </Tab.Navigator>
    </RoleScopeProvider>
  );
}
