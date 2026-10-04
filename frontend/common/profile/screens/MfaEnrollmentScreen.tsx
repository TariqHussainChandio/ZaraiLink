import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { Banner, Button, TextField } from '../../components';
import {
  useEnrollTotp,
  useUnenrollTotp,
  useVerifiedTotpFactor,
  useVerifyTotpEnrollment,
  type TotpEnrollment,
  mapMfaErrorMessage,
} from '../../auth';
import { useTheme, type Theme, useRoleAccent, type Accent } from '../../../theme';
import type { ProfileScreenProps } from '../../../navigation/stacks/ProfileNavigator';

type ScreenState = 'loading' | 'enrolled' | 'not-enrolled' | 'enrolling';

// P4 (4A.4). Only meaningful for admins today — every admin *write* endpoint requires a verified
// second factor (auth/dependencies.py:require_admin_aal2, plus the matching RLS check) — but any account
// can reach and use this screen; it isn't gated to the admin role here, since a second factor is
// never a bad idea and other roles may need it once P5's authorization matrix widens what it
// covers.
export function MfaEnrollmentScreen(_props: ProfileScreenProps<'MfaEnrollment'>) {
  const theme = useTheme();
  const accent = useRoleAccent();
  const styles = useMemo(() => makeStyles(theme, accent), [theme, accent]);
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
        <ActivityIndicator color={accent.mark} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Two-factor authentication</Text>
      <Text style={styles.subtitle}>Admin actions that change data (suspending a user, verifying an expert, and similar) require a verified authenticator app code in addition to your password.</Text>

      {error ?? loadErrorMessage ? (

        <View style={styles.errorBanner}>

          <Banner tone="danger" title={error ?? loadErrorMessage ?? undefined} />

        </View>

      ) : null}

      {state === 'enrolled' ? (
        <>
          <Text style={styles.statusEnabled}>Two-factor authentication is enabled.</Text>
          <Button
            label="Turn off two-factor authentication"
            variant="danger"
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
            <SvgXml xml={enrollment.qrCodeSvg} width={theme.size.qrCode} height={theme.size.qrCode} />
          </View>
          <Text style={styles.secretLabel}>{"Can't scan the code? Enter this key manually:"}</Text>
          <Text selectable style={styles.secret}>
            {enrollment.secret}
          </Text>

          <Text style={styles.stepLabel}>2. Enter the 6-digit code from your app</Text>
          <TextField
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

function makeStyles({ colors, space, typography, fontWeight, radius }: Theme, accent: Accent) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.surface,
    },
    content: {
      padding: space[4],
    },
    title: {
      ...typography.titleLg,
      color: colors.ink,
    },
    subtitle: {
      ...typography.body,
      color: colors.ink2,
      marginTop: space[1],
      marginBottom: space[4],
    },
    statusEnabled: {
      ...typography.body,
      color: colors.status.success.mark,
      marginBottom: space[3],
    },
    stepLabel: {
      ...typography.caption,
      fontWeight: fontWeight.semibold,
      color: colors.ink,
      marginTop: space[4],
      marginBottom: space[2],
    },
    qrContainer: {
      alignItems: 'center',
      padding: space[3],
      backgroundColor: colors.surface,
      borderRadius: radius.sm,
      alignSelf: 'flex-start',
    },
    secretLabel: {
      ...typography.caption,
      color: colors.ink2,
      marginTop: space[2],
    },
    // The setup key is typed by hand into an authenticator app: the mono face keeps 0/O and 1/l apart.
    secret: {
      ...typography.code,
      color: colors.ink,
      marginTop: space[1],
    },
    errorBanner: {
      marginBottom: space[3],
    },
    action: {
      marginTop: space[3],
    },
  });
}
