import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Button, Input } from '../../components/ui';
import {
  useResendRecoveryOtp,
  useResendSignupOtp,
  useVerifyRecoveryOtp,
  useVerifySignupOtp,
} from '../../hooks/api/auth';
import { useTheme, type Theme } from '../../theme';
import { mapAuthErrorMessage } from './mapAuthError';
import type { AuthScreenProps } from '../../navigation/stacks/AuthNavigator';

const RESEND_COOLDOWN_SECONDS = 30;

export function VerifyOtpScreen({ route, navigation }: AuthScreenProps<'VerifyOtp'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { mutateAsync: verifyRecoveryOtp } = useVerifyRecoveryOtp();
  const { mutateAsync: verifySignupOtp } = useVerifySignupOtp();
  const { mutateAsync: resendRecoveryOtp } = useResendRecoveryOtp();
  const { mutateAsync: resendSignupOtp } = useResendSignupOtp();
  const { purpose, identifier } = route.params;
  const channel = purpose === 'signup' ? route.params.channel : 'email';
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
        await verifyRecoveryOtp({ email: identifier, token: code });
      } else {
        await verifySignupOtp({ channel, identifier, token: code });
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
        await resendRecoveryOtp(identifier);
      } else {
        await resendSignupOtp({ channel, identifier });
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

  const title =
    purpose === 'recovery'
      ? 'Enter your reset code'
      : channel === 'email'
        ? 'Verify your email'
        : 'Verify your phone';
  const subtitle =
    purpose === 'recovery'
      ? `We sent a password reset code to ${identifier}. Enter it below to continue.`
      : `We sent a verification code to ${identifier}. Enter it below to activate your account.`;
  const backLabel = purpose === 'recovery' ? 'Back' : 'Back to sign up';

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        <Input
          label="Verification code"
          accessibilityHint="6-digit code sent to your email or phone"
          keyboardType="number-pad"
          maxLength={6}
          value={code}
          onChangeText={onChangeCode}
          error={error ?? undefined}
          textContentType="oneTimeCode"
          autoComplete={channel === 'phone' ? 'sms-otp' : 'email-otp'}
        />

        <Button
          label="Verify"
          loading={submitting}
          disabled={code.length !== 6}
          onPress={onVerify}
          style={styles.submit}
        />

        <TouchableOpacity
          onPress={onResend}
          disabled={resending || cooldown > 0}
          accessibilityRole="button"
          accessibilityState={{ disabled: resending || cooldown > 0 }}
        >
          <Text style={[styles.link, (resending || cooldown > 0) && styles.linkDisabled]}>
            {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityRole="button">
          <Text style={styles.back}>{backLabel}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles({ colors, spacing, typography }: Theme) {
  return StyleSheet.create({
    flex: { flex: 1 },
    container: {
      flex: 1,
      justifyContent: 'center',
      padding: spacing.xl,
    },
    title: {
      fontSize: typography.sizes['3xl'],
      fontWeight: typography.weights.bold,
      color: colors.text.primary,
    },
    subtitle: {
      fontSize: typography.sizes.base,
      color: colors.text.secondary,
      marginTop: spacing.xs,
      marginBottom: spacing.xl,
    },
    submit: {
      marginTop: spacing.sm,
    },
    link: {
      color: colors.brand.primary,
      fontWeight: typography.weights.semibold,
      marginTop: spacing.xl,
      textAlign: 'center',
    },
    linkDisabled: {
      color: colors.text.secondary,
    },
    back: {
      color: colors.text.secondary,
      marginTop: spacing.lg,
      textAlign: 'center',
    },
  });
}
