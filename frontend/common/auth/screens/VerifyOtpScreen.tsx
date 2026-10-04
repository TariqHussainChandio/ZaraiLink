import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button, TextField } from '../../components';
import {
  useResendRecoveryOtp,
  useResendSignupOtp,
  useVerifyRecoveryOtp,
  useVerifySignupOtp,
} from '../hooks/auth';
import { useTheme, type Theme } from '../../../theme';
import { mapAuthErrorMessage } from './mapAuthError';
import type { AuthScreenProps } from '../../../navigation/stacks/AuthNavigator';

const RESEND_COOLDOWN_SECONDS = 30;

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
  const [cooldown, setCooldown] = useState(0);
  const cooldownInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // P4 (4B.3): the previous version leaked this interval on unmount — verifying successfully (or
  // navigating back) mid-cooldown left a setInterval ticking against an unmounted component.
  useEffect(() => {
    return () => {
      if (cooldownInterval.current) clearInterval(cooldownInterval.current);
    };
  }, []);

  const onVerify = async () => {
    setError(null);
    setSubmitting(true);
    try {
      // On success this signs the user in (or, for recovery, starts a password-recovery
      // session); authStore's onAuthStateChange listener picks up the result automatically and
      // RootNavigator swaps screens with no further action needed here.
      if (purpose === 'recovery') {
        await verifyRecoveryOtp({ email, token: code });
      } else {
        await verifySignupOtp({ email, token: code });
      }
    } catch (err) {
      setError(mapAuthErrorMessage(err, 'Invalid or expired code'));
    } finally {
      setSubmitting(false);
    }
  };

  const onResend = async () => {
    setError(null);
    setResending(true);
    try {
      if (purpose === 'recovery') {
        await resendRecoveryOtp(email);
      } else {
        await resendSignupOtp(email);
      }
      setCooldown(RESEND_COOLDOWN_SECONDS);
      cooldownInterval.current = setInterval(() => {
        setCooldown(prev => {
          if (prev <= 1) {
            if (cooldownInterval.current) clearInterval(cooldownInterval.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      setError(mapAuthErrorMessage(err, 'Failed to resend code'));
    } finally {
      setResending(false);
    }
  };

  const onChangeCode = (value: string) => {
    // Accepts a paste of the full code even if it carries extra characters (e.g. copied along
    // with surrounding text like "Your code is: 123456") — strip anything that isn't a digit,
    // then cap at 6.
    setCode(value.replace(/\D/g, '').slice(0, 6));
  };

  const title = purpose === 'recovery' ? 'Enter your reset code' : 'Verify your email';
  const subtitle =
    purpose === 'recovery'
      ? `We sent a password reset code to ${email}. Enter it below to continue.`
      : `We sent a verification code to ${email}. Enter it below to activate your account.`;
  const backLabel = purpose === 'recovery' ? 'Back' : 'Back to sign up';

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        <TextField
          label="Verification code"
          accessibilityHint="6-digit code sent to your email"
          keyboardType="number-pad"
          maxLength={6}
          value={code}
          onChangeText={onChangeCode}
          error={error ?? undefined}
          textContentType="oneTimeCode"
          autoComplete="email-otp"
        />

        <Button
          label="Verify"
          loading={submitting}
          disabled={code.length !== 6}
          onPress={onVerify}
          style={styles.submit}
        />

        <View style={styles.links}>
          <Button
            label={cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            variant="quiet"
            fullWidth={false}
            disabled={resending || cooldown > 0}
            onPress={onResend}
          />
          <Button label={backLabel} variant="quiet" fullWidth={false} onPress={() => navigation.goBack()} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    links: {
      alignItems: 'center',
      marginTop: space[4],
      gap: space[2],
    },
    flex: { flex: 1 },
    container: {
      flex: 1,
      justifyContent: 'center',
      padding: space[6],
    },
    title: {
      ...typography.display,
      color: colors.ink,
    },
    subtitle: {
      ...typography.body,
      color: colors.ink2,
      marginTop: space[1],
      marginBottom: space[6],
    },
    submit: {
      marginTop: space[2],
    },
  });
}
