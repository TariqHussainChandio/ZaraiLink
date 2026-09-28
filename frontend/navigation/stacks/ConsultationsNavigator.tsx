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

export type ConsultationsStackParamList = {
  [CONSULTATIONS_ROUTES.ConsultationList]: undefined;
  [CONSULTATIONS_ROUTES.ExpertList]: { specialization?: ExpertSpecialization; prefill?: DiseasePrefill } | undefined;
  [CONSULTATIONS_ROUTES.ExpertProfile]: { expertId: string; prefill?: DiseasePrefill };
  [CONSULTATIONS_ROUTES.RequestConsultation]: { expertId: string; prefill?: DiseasePrefill };
  [CONSULTATIONS_ROUTES.ConsultationDetail]: { consultationId: string };
};

export type ConsultationsScreenProps<RouteName extends keyof ConsultationsStackParamList> =
  NativeStackScreenProps<ConsultationsStackParamList, RouteName>;

const Stack = createNativeStackNavigator<ConsultationsStackParamList>();

// Requester-side flow (Buyer/Farmer per §34, mounted from `AppNavigator`'s Consultations tab):
// browse verified experts, view a profile, request a consultation, and track existing ones.
export function ConsultationsNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: true }}>
      <Stack.Screen
        name={CONSULTATIONS_ROUTES.ConsultationList}
        component={ConsultationListScreen}
        options={{ title: 'Consultations' }}
      />
      <Stack.Screen
        name={CONSULTATIONS_ROUTES.ExpertList}
        component={ExpertListScreen}
        options={{ title: 'Find an Expert' }}
      />
      <Stack.Screen
        name={CONSULTATIONS_ROUTES.ExpertProfile}
        component={ExpertProfileScreen}
        options={{ title: 'Expert Profile' }}
      />
      <Stack.Screen
        name={CONSULTATIONS_ROUTES.RequestConsultation}
        component={RequestConsultationScreen}
        options={{ title: 'Request Consultation' }}
      />
      <Stack.Screen
        name={CONSULTATIONS_ROUTES.ConsultationDetail}
        component={ConsultationDetailScreen}
        options={{ title: 'Consultation' }}
      />
    </Stack.Navigator>
  );
}
