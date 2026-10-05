import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { ApplicationStatusScreen } from '../../common/auth/screens/ApplicationStatusScreen';
import { ApplicationWizardScreen } from '../../common/auth/screens/ApplicationWizardScreen';
import { APPROVAL_ROUTES } from '../../common/constants/routes';
import { DeleteAccountScreen } from '../../common/profile/screens/DeleteAccountScreen';
import { useAuthStore } from '../../state/authStore';
import { RoleScopeProvider } from '../../theme';
import { stackScreenOptions } from '../stackHeader';

export type ApprovalStackParamList = {
  [APPROVAL_ROUTES.ApplicationStatus]: undefined;
  [APPROVAL_ROUTES.ApplicationWizard]: undefined;
  [APPROVAL_ROUTES.DeleteAccount]: undefined;
};

const ApprovalStack = createNativeStackNavigator<ApprovalStackParamList>();

// Everything a dealer or expert can reach while their application is pending or rejected (A3a, decision D10): its
// status, the application itself (A3b), and deleting the account. No tabs and no role tools: the API refuses those
// too (403 account_not_approved), and the database policies refuse them a third time.
export function ApprovalNavigator() {
  const role = useAuthStore(state => state.role);
  return (
    <RoleScopeProvider scope={role === 'expert' ? 'expert' : 'dealer'}>
      <ApprovalStack.Navigator screenOptions={stackScreenOptions}>
        <ApprovalStack.Screen
          name={APPROVAL_ROUTES.ApplicationStatus}
          component={ApplicationStatusScreen}
          options={{ title: 'Your application' }}
        />
        <ApprovalStack.Screen
          name={APPROVAL_ROUTES.ApplicationWizard}
          component={ApplicationWizardScreen}
          options={{ title: role === 'expert' ? 'Expert application' : 'Dealer application' }}
        />
        <ApprovalStack.Screen
          name={APPROVAL_ROUTES.DeleteAccount}
          component={DeleteAccountScreen}
          options={{ title: 'Delete account' }}
        />
      </ApprovalStack.Navigator>
    </RoleScopeProvider>
  );
}
