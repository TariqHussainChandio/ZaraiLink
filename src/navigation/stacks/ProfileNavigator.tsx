import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { PROFILE_ROUTES } from '../../constants/routes';
import { ChangePasswordScreen } from '../../screens/profile/ChangePasswordScreen';
import { DeleteAccountScreen } from '../../screens/profile/DeleteAccountScreen';
import { EditProfileScreen } from '../../screens/profile/EditProfileScreen';
import { MfaEnrollmentScreen } from '../../screens/profile/MfaEnrollmentScreen';
import { SettingsScreen } from '../../screens/profile/SettingsScreen';
import { ViewProfileScreen } from '../../screens/profile/ViewProfileScreen';

export type ProfileStackParamList = {
  [PROFILE_ROUTES.ViewProfile]: undefined;
  [PROFILE_ROUTES.EditProfile]: undefined;
  [PROFILE_ROUTES.Settings]: undefined;
  [PROFILE_ROUTES.ChangePassword]: undefined;
  [PROFILE_ROUTES.MfaEnrollment]: undefined;
  [PROFILE_ROUTES.DeleteAccount]: undefined;
};

export type ProfileScreenProps<RouteName extends keyof ProfileStackParamList> =
  NativeStackScreenProps<ProfileStackParamList, RouteName>;

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export function ProfileNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: true }}>
      <Stack.Screen
        name={PROFILE_ROUTES.ViewProfile}
        component={ViewProfileScreen}
        options={{ title: 'Profile' }}
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
    </Stack.Navigator>
  );
}
