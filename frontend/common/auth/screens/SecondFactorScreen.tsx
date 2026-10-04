import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Banner, Button, Card, TextField } from '../../components';
import { useVerifySecondFactor } from '../hooks/mfa';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';
import { mapMfaErrorMessage } from './mapAuthError';

/**
 * The second factor at sign-in, for an admin with an authenticator (A3a verification, H1). Every admin write (approve,
 * reject, suspend, moderate) needs a session that has used it (aal2, required by FastAPI and the database alike), so the
 * console opens only after the code. A correct code makes Supabase issue the stronger session, which the auth store
 * picks up from its own listener.
 */
export function SecondFactorScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const signOut = useAuthStore(state => state.signOut);
  const verify = useVerifySecondFactor();
  const [code, setCode] = useState('');

  const submit = () => verify.mutate(code);

  return (
    <View style={styles.screen}>
      <Card>
        <Text style={styles.title} accessibilityRole="header">
          Two-step verification
        </Text>
        <Text style={styles.description}>Enter the 6-digit code from your authenticator app.</Text>
        <TextField
          label="Authentication code"
          keyboardType="number-pad"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChangeText={value => setCode(value.replace(/\D/g, ''))}
        />
        {verify.error ? (
          <View style={styles.error}>
            <Banner tone="danger" title={mapMfaErrorMessage(verify.error, 'Could not verify the code')} />
          </View>
        ) : null}
        <Button
          label="Verify"
          onPress={submit}
          loading={verify.isPending}
          disabled={code.length !== 6}
          fullWidth
          style={styles.action}
        />
        <Button label="Sign out" variant="quiet" onPress={signOut} fullWidth />
      </Card>
    </View>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, justifyContent: 'center', padding: space[4], backgroundColor: colors.ground },
    title: { ...typography.title, color: colors.ink },
    description: { ...typography.body, color: colors.ink2, marginTop: space[2], marginBottom: space[4] },
    error: { marginTop: space[3] },
    action: { marginTop: space[4], marginBottom: space[2] },
  });
}
