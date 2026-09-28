import React from 'react';
import { ResetPasswordScreen } from '../../common/auth/screens/ResetPasswordScreen';
import { SplashScreen } from '../../common/auth/screens/SplashScreen';
import { SuspendedScreen } from '../../common/auth/screens/SuspendedScreen';
import { ErrorBoundary } from '../../common/components/ErrorBoundary';
import { useAuthStore } from '../../state/authStore';
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
  if (status !== 'authenticated') {
    return (
      <Guarded name="auth navigator">
        <AuthNavigator />
      </Guarded>
    );
  }

  // Expert and Admin have nav trees divergent enough from Buyer/Farmer/Dealer (SRDS v4.0
  // §34) that they get their own dedicated top-level navigator instead of sharing AppNavigator.
  if (role === 'expert') {
    return (
      <Guarded name="expert navigator">
        <ExpertNavigator />
      </Guarded>
    );
  }
  if (role === 'admin') {
    return (
      <Guarded name="admin navigator">
        <AdminNavigator />
      </Guarded>
    );
  }
  return (
    <Guarded name="app navigator">
      <AppNavigator />
    </Guarded>
  );
}

// P7 (7E): each navigator has its own boundary, keyed by its name so a boundary that caught an error is discarded,
// not reused, when the user signs out and someone with another role signs in.
function Guarded({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <ErrorBoundary key={name} name={name}>
      {children}
    </ErrorBoundary>
  );
}
