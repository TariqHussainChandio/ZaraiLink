import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { CONSULTATIONS_ROUTES } from '../../constants/routes';
import { ConsultationDetailScreen } from '../../screens/expert/ConsultationDetailScreen';
import { ConsultationListScreen } from '../../screens/expert/ConsultationListScreen';
import { ExpertListScreen } from '../../screens/expert/ExpertListScreen';
import { ExpertProfileScreen } from '../../screens/expert/ExpertProfileScreen';
import { RequestConsultationScreen } from '../../screens/expert/RequestConsultationScreen';
import type { ExpertSpecialization } from '../../types/expert';
import type { DiseasePrefill } from '../../types/disease';

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
