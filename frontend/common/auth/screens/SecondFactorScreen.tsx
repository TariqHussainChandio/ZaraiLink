import React, { useState } from 'react';
import { Button, CodeField } from '../../components';
import { useVerifySecondFactor } from '../hooks/mfa';
import { useAuthStore } from '../../../state/authStore';
import { AuthScreen } from '../components/AuthScreen';
import { mapMfaErrorMessage } from './mapAuthError';

/**
 * The second factor at sign-in, for anyone who turned on two-step verification in their Account (optional; the admin
 * has none, D19). Their shell opens only after the code. A correct code makes Supabase issue the stronger session, which
 * the auth store picks up from its own listener.
 */
export function SecondFactorScreen() {
  const signOut = useAuthStore(state => state.signOut);
  const verify = useVerifySecondFactor();
  const [code, setCode] = useState('');

  const submit = (value: string) => {
    if (!verify.isPending) verify.mutate(value);
  };

  return (
    <AuthScreen title="Two-step verification" subtitle="Enter the 6-digit code from your authenticator app.">
      <CodeField
        label="Authentication code"
        value={code}
        onChange={setCode}
        onComplete={submit}
        error={verify.error ? mapMfaErrorMessage(verify.error, 'Could not verify the code. Try again.') : undefined}
      />
      <Button label="Verify" size="lg" onPress={() => submit(code)} loading={verify.isPending} disabled={code.length !== 6} />
      <Button label="Sign out" variant="secondary" onPress={signOut} />
    </AuthScreen>
  );
}
