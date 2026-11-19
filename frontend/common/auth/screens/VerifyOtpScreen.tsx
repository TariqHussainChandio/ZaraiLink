import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, CodeField } from '../../components';
import {
  useResendRecoveryOtp,
  useResendSignupOtp,
  useVerifyRecoveryOtp,
  useVerifySignupOtp,
} from '../hooks/auth';
import { AuthScreen } from '../components/AuthScreen';
import { formatCountdown, useResendCooldown } from '../hooks/useResendCooldown';
import { useTheme, type Theme } from '../../../theme';
import { mapAuthErrorMessage } from './mapAuthError';
import type { AuthScreenProps } from '../../../navigation/stacks/AuthNavigator';

// supabase/config.toml: `otp_expiry = 900`. Said on the screen so a person who comes back late knows to ask for a new one.
const CODE_LIFETIME = 'Check your spam folder. The code works for 15 minutes.';

export function VerifyOtpScreen({ route, navigation }: AuthScreenProps<'VerifyOtp'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { mutateAsync: verifyRecoveryOtp } = useVerifyRecoveryOtp();
  const { mutateAsync: verifySignupOtp } = useVerifySignupOtp();
  const { mutateAsync: resendRecoveryOtp } = useResendRecoveryOtp();
  const { mutateAsync: resendSignupOtp } = useResendSignupOtp();
  const { purpose, email } = route.params;
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  // What the last resend did, on a line of its own: it is not a fault of the code in the box.
  const [resendResult, setResendResult] = useState<{ ok: boolean; text: string } | null>(null);
  // The code that brought the person here was sent a moment ago, so the wait starts now (Supabase allows one email a
  // minute); a resend sooner would only be refused.
  const { remaining, restart } = useResendCooldown();

  const onVerify = async (token: string) => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      // On success this signs the user in (or, for recovery, starts a password-recovery
      // session); authStore's onAuthStateChange listener picks up the result automatically and
      // RootNavigator swaps screens with no further action needed here.
      if (purpose === 'recovery') {
        await verifyRecoveryOtp({ email, token });
      } else {
        await verifySignupOtp({ email, token });
      }
    } catch (err) {
      setError(mapAuthErrorMessage(err, 'That code did not work. Check it, or ask for a new one.'));
    } finally {
      setSubmitting(false);
    }
  };

  const onResend = async () => {
    setError(null);
    setResendResult(null);
    setResending(true);
    try {
      if (purpose === 'recovery') {
        await resendRecoveryOtp(email);
      } else {
        await resendSignupOtp(email);
      }
      restart();
      setCode('');
      setResendResult({ ok: true, text: 'New code sent. The old one no longer works.' });
    } catch (err) {
      setResendResult({ ok: false, text: mapAuthErrorMessage(err, 'Could not send a new code. Try again.') });
    } finally {
      setResending(false);
    }
  };

  const title = purpose === 'recovery' ? 'Enter your reset code' : 'Check your email';
  const subtitle =
    purpose === 'recovery'
      ? `A password reset code was sent to ${email}.`
      : `A code to confirm your account was sent to ${email}.`;
  const backLabel = purpose === 'recovery' ? 'Back' : 'Back to sign up';

  return (
    <AuthScreen title={title} subtitle={subtitle}>
      <View>
        <CodeField
          label="Code from your email"
          value={code}
          onChange={setCode}
          onComplete={onVerify}
          error={error ?? undefined}
        />
        <Text style={styles.helper}>{CODE_LIFETIME}</Text>
      </View>

      <Button label="Verify" size="lg" loading={submitting} disabled={code.length !== 6} onPress={() => onVerify(code)} />

      <View style={styles.resend}>
        {remaining > 0 ? (
          <Text style={styles.countdown} accessibilityLabel={`You can ask for a new code in ${remaining} seconds`}>
            {`Resend code in ${formatCountdown(remaining)}`}
          </Text>
        ) : (
          <Button label="Resend code" variant="secondary" fullWidth={false} loading={resending} onPress={onResend} />
        )}
        {resendResult ? (
          <Text
            style={[styles.result, resendResult.ok ? styles.resultOk : styles.resultFail]}
            accessibilityLiveRegion="polite"
          >
            {resendResult.text}
          </Text>
        ) : null}
      </View>

      <Button label={backLabel} variant="quiet" fullWidth={false} onPress={() => navigation.goBack()} style={styles.back} />
    </AuthScreen>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    helper: { ...typography.caption, color: colors.ink3 },
    resend: { gap: space[2], alignItems: 'flex-start' },
    countdown: { ...typography.body, color: colors.ink2 },
    result: { ...typography.caption },
    resultOk: { color: colors.status.success.ink },
    resultFail: { color: colors.status.danger.ink },
    back: { alignSelf: 'flex-start' },
  });
}
