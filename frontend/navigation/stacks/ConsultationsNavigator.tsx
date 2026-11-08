import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { CONSULTATIONS_ROUTES } from '../../common/constants/routes';
import { ConsultationDetailScreen } from '../../common/consultations/screens/ConsultationDetailScreen';
import { ConsultationListScreen } from '../../common/consultations/screens/ConsultationListScreen';
import { ExpertListScreen } from '../../common/consultations/screens/ExpertListScreen';
import { ExpertProfileScreen } from '../../common/consultations/screens/ExpertProfileScreen';
import { RequestConsultationScreen } from '../../common/consultations/screens/RequestConsultationScreen';
import type { ExpertSpecialization } from '../../expert';
import type { DiseasePrefill } from '../../ai';
import { consultationsActions } from '../headerActions';
import { stackOptionsWithActions } from '../stackHeader';

export type ConsultationsStackParamList = {
  [CONSULTATIONS_ROUTES.ConsultationList]: undefined;
  [CONSULTATIONS_ROUTES.ExpertList]: { specialization?: ExpertSpecialization; prefill?: DiseasePrefill } | undefined;
  [CONSULTATIONS_ROUTES.ExpertProfile]: { expertId: string; prefill?: DiseasePrefill };
  [CONSULTATIONS_ROUTES.RequestConsultation]: { expertId: string; prefill?: DiseasePrefill };
  [CONSULTATIONS_ROUTES.ConsultationDetail]: { consultationId: string; aiSuggestion?: { label: string; confidence: number } };
};

export type ConsultationsScreenProps<RouteName extends keyof ConsultationsStackParamList> =
  NativeStackScreenProps<ConsultationsStackParamList, RouteName>;

const Stack = createNativeStackNavigator<ConsultationsStackParamList>();
// Farmers and buyers find a verified expert from here; farmers also start the disease scan (SRDS rule 22).
const CONSULTATIONS_STACK_OPTIONS = stackOptionsWithActions({ [CONSULTATIONS_ROUTES.ConsultationList]: consultationsActions });

// Requester-side flow (Buyer/Farmer per §34, mounted from `AppNavigator`'s Consultations tab):
// browse verified experts, view a profile, request a consultation, and track existing ones.
export function ConsultationsNavigator() {
  return (
    <Stack.Navigator screenOptions={CONSULTATIONS_STACK_OPTIONS}>
      <Stack.Screen
        name={CONSULTATIONS_ROUTES.ConsultationList}
        component={ConsultationListScreen}
        options={{ title: 'Consultations' }}
      />
      <Stack.Screen
        name={CONSULTATIONS_ROUTES.ExpertList}
        component={ExpertListScreen}
        options={{ title: 'Find an expert' }}
      />
      <Stack.Screen
        name={CONSULTATIONS_ROUTES.ExpertProfile}
        component={ExpertProfileScreen}
        options={{ title: 'Expert profile' }}
      />
      <Stack.Screen
        name={CONSULTATIONS_ROUTES.RequestConsultation}
        component={RequestConsultationScreen}
        options={{ title: 'Ask an expert' }}
      />
      <Stack.Screen
        name={CONSULTATIONS_ROUTES.ConsultationDetail}
        component={ConsultationDetailScreen}
        // The case is named by its AI suggestion when it came from a plant scan; otherwise it is simply a case.
        options={({ route }) => ({ title: route.params.aiSuggestion?.label ?? 'Case' })}
      />
    </Stack.Navigator>
  );
}
