import { ShieldCheck } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { Banner, Button, CodeField, ConfirmSheet, ScreenScaffold, Skeleton } from '../../components';
import {
  useEnrollTotp,
  useUnenrollTotp,
  useVerifiedTotpFactor,
  useVerifyTotpEnrollment,
  type TotpEnrollment,
  mapMfaErrorMessage,
} from '../../auth';
import { useTheme, type Theme } from '../../../theme';
import type { ProfileScreenProps } from '../../../navigation/stacks/ProfileNavigator';

type ScreenState = 'loading' | 'enrolled' | 'not-enrolled' | 'enrolling';

// P4 (4A.4). Only meaningful for admins today — every admin *write* endpoint requires a verified
// second factor (auth/dependencies.py:require_admin_aal2, plus the matching RLS check) — but any account
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
  const [codeError, setCodeError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingOff, setConfirmingOff] = useState(false);

  const factorQuery = useVerifiedTotpFactor();
  const { mutateAsync: enrollTotp } = useEnrollTotp();
  const { mutateAsync: verifyEnrollment } = useVerifyTotpEnrollment();
  const { mutateAsync: unenrollTotp } = useUnenrollTotp();

  const { data: loadedFactorId, error: loadError, isPending: loadingFactor } = factorQuery;
  // A factor enrolled in an earlier session (read on load) or one verified just now: either is what onDisable needs.
  const verifiedFactorId = factorOverride !== undefined ? factorOverride : (loadedFactorId ?? null);
  const loadedState: ScreenState = loadingFactor ? 'loading' : loadedFactorId ? 'enrolled' : 'not-enrolled';
  const state = stateOverride ?? loadedState;
  const loadErrorMessage = loadError ? 'Could not check two-step verification. Try again.' : null;

  const onStartEnroll = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const result = await enrollTotp();
      setEnrollment(result);
      setState('enrolling');
    } catch (err) {
      setError(mapMfaErrorMessage(err, 'Could not start the setup. Try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  const onVerify = async (token: string) => {
    if (!enrollment || submitting) return;
    setCodeError(null);
    setSubmitting(true);
    try {
      await verifyEnrollment({ factorId: enrollment.factorId, code: token });
      setVerifiedFactorId(enrollment.factorId);
      setState('enrolled');
    } catch (err) {
      setCodeError(mapMfaErrorMessage(err, "That code isn't right. Check your app and try again."));
    } finally {
      setSubmitting(false);
    }
  };

  // Opens the authenticator app with the key already in it: a phone cannot scan a QR code shown on its own screen.
  const openAuthenticator = async () => {
    if (!enrollment) return;
    setError(null);
    try {
      await Linking.openURL(enrollment.uri);
    } catch {
      setError('No authenticator app was found on this phone. Install one, or type the key into the app you use.');
    }
  };

  // Rethrows: the confirm sheet shows a refusal inside itself and stays open.
  const onDisable = async () => {
    if (!verifiedFactorId) return;
    try {
      await unenrollTotp(verifiedFactorId);
    } catch (err) {
      throw new Error(mapMfaErrorMessage(err, 'Could not turn off two-step verification. Try again.'));
    }
    setVerifiedFactorId(null);
    setEnrollment(null);
    setCode('');
    setState('not-enrolled');
  };

  if (state === 'loading') {
    return (
      <ScreenScaffold>
        <View accessibilityLabel="Checking two-step verification" accessibilityRole="progressbar" style={styles.loading}>
          <Skeleton style={styles.skeletonLine} />
          <Skeleton style={styles.skeletonButton} />
        </View>
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold>
      <Text style={styles.subtitle}>
        Admin actions that change data, such as suspending a user or verifying an expert, need a code from your authenticator app as well as your password.
      </Text>

      {error ?? loadErrorMessage ? <Banner tone="danger" title={error ?? loadErrorMessage ?? undefined} /> : null}

      {state === 'enrolled' ? (
        <>
          <View style={styles.on}>
            <ShieldCheck color={theme.colors.status.success.mark} size={theme.size.iconMd} strokeWidth={theme.size.iconStroke} />
            <Text style={styles.onText}>Two-step verification is on.</Text>
          </View>
          <Button label="Turn off two-step verification" variant="dangerQuiet" onPress={() => setConfirmingOff(true)} />
        </>
      ) : null}

      {state === 'not-enrolled' ? (
        <Button label="Set up two-step verification" size="lg" loading={submitting} onPress={onStartEnroll} />
      ) : null}

      {state === 'enrolling' && enrollment ? (
        <>
          <Text style={styles.step}>1. Add this account to your authenticator app</Text>
          <Button label="Open authenticator app" variant="secondary" onPress={openAuthenticator} />
          <Text style={styles.body}>On another phone or a computer? Scan this code with an authenticator app such as Google Authenticator or Authy.</Text>
          {/* A QR code needs a light quiet zone around it to scan, so it sits on chalk, which is the same in the dark theme
              (the dark `surface` would make it unreadable to the scanner). */}
          <View style={styles.qrContainer}>
            <SvgXml xml={enrollment.qrCodeSvg} width={theme.size.qrCode} height={theme.size.qrCode} />
          </View>
          <Text style={styles.body}>{"Can't scan or open it? Type this key into the app:"}</Text>
          <Text selectable style={styles.secret}>
            {enrollment.secret}
          </Text>

          <Text style={styles.step}>2. Enter the 6-digit code from your app</Text>
          <CodeField label="Authentication code" value={code} onChange={setCode} onComplete={onVerify} error={codeError ?? undefined} />
          <Button label="Verify and turn on" size="lg" loading={submitting} disabled={code.length !== 6} onPress={() => onVerify(code)} />
        </>
      ) : null}

      <ConfirmSheet
        visible={confirmingOff}
        onClose={() => setConfirmingOff(false)}
        title="Turn off two-step verification?"
        message="Approvals, suspensions and other admin decisions stop working until you set it up again. Anyone with your password could then sign in."
        confirmLabel="Turn off"
        keepLabel="Keep it on"
        destructive
        onConfirm={onDisable}
      />
    </ScreenScaffold>
  );
}

function makeStyles({ colors, space, size, typography, radius }: Theme) {
  return StyleSheet.create({
    subtitle: { ...typography.body, color: colors.ink2 },
    body: { ...typography.body, color: colors.ink2 },
    step: { ...typography.title, color: colors.ink },
    loading: { gap: space[3] },
    skeletonLine: { height: size.iconLg },
    skeletonButton: { height: size.buttonLg },
    on: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    onText: { ...typography.bodyStrong, color: colors.status.success.ink, flexShrink: 1 },
    qrContainer: {
      alignItems: 'center',
      padding: space[3],
      backgroundColor: colors.onBoard,
      borderRadius: radius.sm,
      alignSelf: 'flex-start',
    },
    // The setup key is typed by hand into an authenticator app: the mono face keeps 0/O and 1/l apart.
    secret: { ...typography.code, color: colors.ink },
  });
}
