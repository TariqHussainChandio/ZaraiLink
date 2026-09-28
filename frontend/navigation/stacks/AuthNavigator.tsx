import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { AUTH_ROUTES } from '../../common/constants/routes';
import { ForgotPasswordScreen } from '../../common/auth/screens/ForgotPasswordScreen';
import { LoginScreen } from '../../common/auth/screens/LoginScreen';
import { RegisterScreen } from '../../common/auth/screens/RegisterScreen';
import { VerifyOtpScreen } from '../../common/auth/screens/VerifyOtpScreen';

export type AuthStackParamList = {
  [AUTH_ROUTES.Login]: undefined;
  [AUTH_ROUTES.Register]: undefined;
  [AUTH_ROUTES.ForgotPassword]: undefined;
  [AUTH_ROUTES.VerifyOtp]:
    | { purpose: 'signup'; channel: 'email' | 'phone'; identifier: string }
    // Recovery is email-only — Supabase has no SMS recovery flow, and phone sign-up is Blocked
    // project-wide anyway.
    | { purpose: 'recovery'; identifier: string };
};

export type AuthScreenProps<RouteName extends keyof AuthStackParamList> =
  NativeStackScreenProps<AuthStackParamList, RouteName>;

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name={AUTH_ROUTES.Login} component={LoginScreen} />
      <Stack.Screen name={AUTH_ROUTES.Register} component={RegisterScreen} />
      <Stack.Screen name={AUTH_ROUTES.ForgotPassword} component={ForgotPasswordScreen} />
      <Stack.Screen name={AUTH_ROUTES.VerifyOtp} component={VerifyOtpScreen} />
    </Stack.Navigator>
  );
}
