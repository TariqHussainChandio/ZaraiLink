import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { Button, Input } from '../../components/ui';
import {
  useEnrollTotp,
  useUnenrollTotp,
  useVerifiedTotpFactor,
  useVerifyTotpEnrollment,
  type TotpEnrollment,
} from '../../hooks/api/mfa';
import { useTheme, type Theme } from '../../theme';
import { mapMfaErrorMessage } from '../auth/mapAuthError';
import type { ProfileScreenProps } from '../../navigation/stacks/ProfileNavigator';

type ScreenState = 'loading' | 'enrolled' | 'not-enrolled' | 'enrolling';

// P4 (4A.4). Only meaningful for admins today — every admin *write* endpoint requires a verified
// second factor (core/auth.py:require_admin_aal2, plus the matching RLS check) — but any account
// can reach and use this screen; it isn't gated to the admin role here, since a second factor is
// never a bad idea and other roles may need it once P5's authorization matrix widens what it
// covers.
export function MfaEnrollmentScreen(_props: ProfileScreenProps<'MfaEnrollment'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // What the user did on this screen (enrolled, disabled) overrides what was read on load.
  const [stateOverride, setState] = useState<ScreenState | null>(null);
  const [factorOverride, setVerifiedFactorId] = useState<string | null | undefined>(undefined);
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const factorQuery = useVerifiedTotpFactor();
  const { mutateAsync: enrollTotp } = useEnrollTotp();
  const { mutateAsync: verifyEnrollment } = useVerifyTotpEnrollment();
  const { mutateAsync: unenrollTotp } = useUnenrollTotp();

  const { data: loadedFactorId, error: loadError, isPending: loadingFactor } = factorQuery;
  // A factor enrolled in an earlier session (read on load) or one verified just now: either is what onDisable needs.
  const verifiedFactorId = factorOverride !== undefined ? factorOverride : (loadedFactorId ?? null);
  const loadedState: ScreenState = loadingFactor ? 'loading' : loadedFactorId ? 'enrolled' : 'not-enrolled';
  const state = stateOverride ?? loadedState;
  const loadErrorMessage = loadError ? 'Could not check two-factor authentication status' : null;

  const onStartEnroll = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const result = await enrollTotp();
      setEnrollment(result);
      setState('enrolling');
    } catch (err) {
      setError(mapMfaErrorMessage(err, 'Could not start two-factor authentication setup'));
    } finally {
      setSubmitting(false);
    }
  };

  const onVerify = async () => {
    if (!enrollment) return;
    setError(null);
    setSubmitting(true);
    try {
      await verifyEnrollment({ factorId: enrollment.factorId, code });
      setVerifiedFactorId(enrollment.factorId);
      setState('enrolled');
    } catch (err) {
      setError(mapMfaErrorMessage(err, "That code isn't right. Check your app and try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const onDisable = async () => {
    if (!verifiedFactorId) return;
    setError(null);
    setSubmitting(true);
    try {
      await unenrollTotp(verifiedFactorId);
      setVerifiedFactorId(null);
      setEnrollment(null);
      setCode('');
      setState('not-enrolled');
    } catch (err) {
      setError(mapMfaErrorMessage(err, 'Could not turn off two-factor authentication'));
    } finally {
      setSubmitting(false);
    }
  };

  if (state === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.brand.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Two-factor authentication</Text>
      <Text style={styles.subtitle}>Admin actions that change data (suspending a user, verifying an expert, and similar) require a verified authenticator app code in addition to your password.</Text>

      {error ?? loadErrorMessage ? <Text style={styles.errorBanner}>{error ?? loadErrorMessage}</Text> : null}

      {state === 'enrolled' ? (
        <>
          <Text style={styles.statusEnabled}>Two-factor authentication is enabled.</Text>
          <Button
            label="Turn off two-factor authentication"
            variant="destructive"
            loading={submitting}
            onPress={onDisable}
            style={styles.action}
          />
        </>
      ) : null}

      {state === 'not-enrolled' ? (
        <Button
          label="Set up two-factor authentication"
          loading={submitting}
          onPress={onStartEnroll}
          style={styles.action}
        />
      ) : null}

      {state === 'enrolling' && enrollment ? (
        <>
          <Text style={styles.stepLabel}>1. Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)</Text>
          <View style={styles.qrContainer}>
            <SvgXml xml={enrollment.qrCodeSvg} width={200} height={200} />
          </View>
          <Text style={styles.secretLabel}>{"Can't scan the code? Enter this key manually:"}</Text>
          <Text selectable style={styles.secret}>
            {enrollment.secret}
          </Text>

          <Text style={styles.stepLabel}>2. Enter the 6-digit code from your app</Text>
          <Input
            label="Authentication code"
            keyboardType="number-pad"
            maxLength={6}
            value={code}
            onChangeText={value => setCode(value.replace(/\D/g, '').slice(0, 6))}
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
          />
          <Button
            label="Verify and enable"
            loading={submitting}
            disabled={code.length !== 6}
            onPress={onVerify}
            style={styles.action}
          />
        </>
      ) : null}
    </ScrollView>
  );
}

function makeStyles({ colors, spacing, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.surface,
    },
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background.surface,
    },
    content: {
      padding: spacing.lg,
    },
    title: {
      fontSize: typography.sizes.xl,
      fontWeight: typography.weights.bold,
      color: colors.text.primary,
    },
    subtitle: {
      fontSize: typography.sizes.base,
      color: colors.text.secondary,
      marginTop: spacing.xs,
      marginBottom: spacing.lg,
    },
    statusEnabled: {
      fontSize: typography.sizes.base,
      color: colors.semantic.success,
      marginBottom: spacing.md,
    },
    stepLabel: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.semibold,
      color: colors.text.primary,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    qrContainer: {
      alignItems: 'center',
      padding: spacing.md,
      backgroundColor: colors.neutral.white,
      borderRadius: 8,
      alignSelf: 'flex-start',
    },
    secretLabel: {
      fontSize: typography.sizes.xs,
      color: colors.text.secondary,
      marginTop: spacing.sm,
    },
    secret: {
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold,
      color: colors.text.primary,
      letterSpacing: 2,
      marginTop: spacing.xs,
    },
    errorBanner: {
      color: colors.semantic.error,
      marginBottom: spacing.md,
    },
    action: {
      marginTop: spacing.md,
    },
  });
}
