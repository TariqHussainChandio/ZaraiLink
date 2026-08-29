import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Button, Input } from '../../components/ui';
import { resendSignupOtp, verifySignupOtp } from '../../services/modules/auth/authService';
import { lightTheme } from '../../theme';
import type { AuthScreenProps } from '../../navigation/stacks/AuthNavigator';

const { colors, spacing, typography } = lightTheme;

const RESEND_COOLDOWN_SECONDS = 30;

export function VerifyOtpScreen({ route, navigation }: AuthScreenProps<'VerifyOtp'>) {
  const { channel, identifier } = route.params;
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const onVerify = async () => {
    setError(null);
    setSubmitting(true);
    try {
      // On success this signs the user in; authStore's onAuthStateChange listener picks up
      // the new session and RootNavigator swaps to the app shell automatically.
      await verifySignupOtp(channel, identifier, code);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid or expired code');
    } finally {
      setSubmitting(false);
    }
  };

  const onResend = async () => {
    setError(null);
    setResending(true);
    try {
      await resendSignupOtp(channel, identifier);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      const interval = setInterval(() => {
        setCooldown(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend code');
    } finally {
      setResending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <Text style={styles.title}>{channel === 'email' ? 'Verify your email' : 'Verify your phone'}</Text>
        <Text style={styles.subtitle}>
          We sent a verification code to {identifier}. Enter it below to activate your account.
        </Text>

        <Input
          label="Verification code"
          keyboardType="number-pad"
          maxLength={6}
          value={code}
          onChangeText={setCode}
          error={error ?? undefined}
        />

        <Button
          label="Verify"
          loading={submitting}
          disabled={code.length === 0}
          onPress={onVerify}
          style={styles.submit}
        />

        <TouchableOpacity onPress={onResend} disabled={resending || cooldown > 0}>
          <Text style={[styles.link, (resending || cooldown > 0) && styles.linkDisabled]}>
            {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>Back to sign up</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  title: {
    fontSize: typography.sizes['3xl'],
    fontWeight: typography.weights.bold as any,
    color: colors.neutral.gray900,
  },
  subtitle: {
    fontSize: typography.sizes.base,
    color: colors.neutral.gray500,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  submit: {
    marginTop: spacing.sm,
  },
  link: {
    color: colors.brand.primary,
    fontWeight: typography.weights.semibold as any,
    marginTop: spacing.xl,
    textAlign: 'center',
  },
  linkDisabled: {
    color: colors.neutral.gray400,
  },
  back: {
    color: colors.neutral.gray500,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
});
