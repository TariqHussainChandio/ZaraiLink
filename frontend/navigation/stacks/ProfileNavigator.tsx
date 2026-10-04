import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { PROFILE_ROUTES } from '../../common/constants/routes';
import { ChangePasswordScreen } from '../../common/profile/screens/ChangePasswordScreen';
import { DeleteAccountScreen } from '../../common/profile/screens/DeleteAccountScreen';
import { EditProfileScreen } from '../../common/profile/screens/EditProfileScreen';
import { MfaEnrollmentScreen } from '../../common/profile/screens/MfaEnrollmentScreen';
import { SettingsScreen } from '../../common/profile/screens/SettingsScreen';
import { ViewProfileScreen } from '../../common/profile/screens/ViewProfileScreen';
import { DesignCatalogueScreen } from '../DesignCatalogueScreen';
import { designCatalogueAction } from '../headerActions';
import { stackOptionsWithActions } from '../stackHeader';

export type ProfileStackParamList = {
  [PROFILE_ROUTES.ViewProfile]: undefined;
  [PROFILE_ROUTES.EditProfile]: undefined;
  [PROFILE_ROUTES.Settings]: undefined;
  [PROFILE_ROUTES.ChangePassword]: undefined;
  [PROFILE_ROUTES.MfaEnrollment]: undefined;
  [PROFILE_ROUTES.DeleteAccount]: undefined;
  [PROFILE_ROUTES.DesignCatalogue]: undefined;
};

export type ProfileScreenProps<RouteName extends keyof ProfileStackParamList> =
  NativeStackScreenProps<ProfileStackParamList, RouteName>;

const Stack = createNativeStackNavigator<ProfileStackParamList>();
// Development builds only: the design catalogue, A2's evidence that every component follows the design system.
const PROFILE_STACK_OPTIONS = stackOptionsWithActions({ [PROFILE_ROUTES.ViewProfile]: designCatalogueAction });

export function ProfileNavigator() {
  return (
    <Stack.Navigator screenOptions={PROFILE_STACK_OPTIONS}>
      <Stack.Screen
        name={PROFILE_ROUTES.ViewProfile}
        component={ViewProfileScreen}
        options={{ title: 'Account' }}
      />
      <Stack.Screen
        name={PROFILE_ROUTES.EditProfile}
        component={EditProfileScreen}
        options={{ title: 'Edit Profile' }}
      />
      <Stack.Screen
        name={PROFILE_ROUTES.Settings}
        component={SettingsScreen}
        options={{ title: 'Settings' }}
      />
      <Stack.Screen
        name={PROFILE_ROUTES.ChangePassword}
        component={ChangePasswordScreen}
        options={{ title: 'Change Password' }}
      />
      <Stack.Screen
        name={PROFILE_ROUTES.MfaEnrollment}
        component={MfaEnrollmentScreen}
        options={{ title: 'Two-Factor Authentication' }}
      />
      <Stack.Screen
        name={PROFILE_ROUTES.DeleteAccount}
        component={DeleteAccountScreen}
        options={{ title: 'Delete Account' }}
      />
      {__DEV__ ? (
        <Stack.Screen name={PROFILE_ROUTES.DesignCatalogue} component={DesignCatalogueScreen} options={{ title: 'Design catalogue' }} />
      ) : null}
    </Stack.Navigator>
  );
}
