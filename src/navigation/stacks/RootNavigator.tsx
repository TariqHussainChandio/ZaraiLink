import React from 'react';
import { ResetPasswordScreen } from '../../screens/common/ResetPasswordScreen';
import { SplashScreen } from '../../screens/common/SplashScreen';
import { SuspendedScreen } from '../../screens/common/SuspendedScreen';
import { useAuthStore } from '../../store/authStore';
import { AdminNavigator } from './AdminNavigator';
import { AppNavigator } from './AppNavigator';
import { AuthNavigator } from './AuthNavigator';
import { ExpertNavigator } from './ExpertNavigator';

export function RootNavigator() {
  const status = useAuthStore(state => state.status);
  const role = useAuthStore(state => state.role);

  if (status === 'loading') return <SplashScreen />;
  if (status === 'suspended') return <SuspendedScreen />;
  // A password-reset link was just exchanged for a session (authStore) — the user must set a
  // new password before reaching the normal authenticated app shell below.
  if (status === 'passwordRecovery') return <ResetPasswordScreen />;
  if (status !== 'authenticated') return <AuthNavigator />;

  // Expert and Admin have nav trees divergent enough from Buyer/Farmer/Dealer (SRDS v4.0
  // §34) that they get their own dedicated top-level navigator instead of sharing AppNavigator.
  if (role === 'expert') return <ExpertNavigator />;
  if (role === 'admin') return <AdminNavigator />;
  return <AppNavigator />;
}
