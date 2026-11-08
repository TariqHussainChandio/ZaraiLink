import { zodResolver } from '@hookform/resolvers/zod';
import { AuthError } from '@supabase/supabase-js';
import React, { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';
import { Banner, Button, CodeField, ScreenScaffold, TextField, useSnackbar } from '../../components';
import { formatCountdown, isSendRateLimited, mapAuthErrorMessage, mapPasswordFlowErrorMessage, useResendCooldown } from '../../auth';
import { newPasswordSchema, PASSWORD_HELPER } from '../../validation/password';
import { useRequestReauthentication, useUpdatePassword } from '../hooks/profile';
import { useTheme, type Theme } from '../../../theme';
import type { ProfileScreenProps } from '../../../navigation/stacks/ProfileNavigator';

const changePasswordSchema = z.object({ password: newPasswordSchema });

type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;

/**
 * The new password, and then, only when Supabase asks for it, the code it emails to confirm the account's owner (A3a).
 * The project requires that code for a session older than a day (secure_password_change, answered with
 * `reauthentication_needed`); for a fresher session Supabase ignores the code, so asking for one would be a step that
 * checks nothing (A3a verification, M1).
 */
export function ChangePasswordScreen({ navigation }: ProfileScreenProps<'ChangePassword'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const snackbar = useSnackbar();
  const { mutateAsync: updatePassword } = useUpdatePassword();
  const reauthenticate = useRequestReauthentication();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingPassword, setPendingPassword] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [resendResult, setResendResult] = useState<{ ok: boolean; text: string } | null>(null);
  // The code goes out when the form is sent, so the minute before another may be asked for starts then.
  const { remaining, restart } = useResendCooldown();
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { password: '' },
  });

  const done = () => {
    snackbar.show('Password updated');
    navigation.goBack();
  };

  const submit = async (values: ChangePasswordFormValues) => {
    setSubmitError(null);
    try {
      await updatePassword(values.password);
      done();
    } catch (error) {
      if (!(error instanceof AuthError && error.code === 'reauthentication_needed')) {
        setSubmitError(mapPasswordFlowErrorMessage(error, 'Could not update the password. Try again.'));
        return;
      }
      try {
        await reauthenticate.mutateAsync();
        setPendingPassword(values.password);
        restart();
      } catch (sendError) {
        setSubmitError(mapPasswordFlowErrorMessage(sendError, 'Could not send the code. Try again.'));
      }
    }
  };

  const confirm = async (token: string) => {
    if (!pendingPassword || confirming) return;
    setSubmitError(null);
    setConfirming(true);
    try {
      await updatePassword({ password: pendingPassword, nonce: token.trim() });
      done();
    } catch (error) {
      setSubmitError(mapPasswordFlowErrorMessage(error, 'Could not update the password. Try again.'));
    } finally {
      setConfirming(false);
    }
  };

  const resend = async () => {
    setResendResult(null);
    try {
      await reauthenticate.mutateAsync();
      restart();
      setCode('');
      setResendResult({ ok: true, text: 'New code sent. The old one no longer works.' });
    } catch (error) {
      // A send refused as too soon leaves the earlier code valid; say that, not "failed".
      setResendResult({
        ok: false,
        text: isSendRateLimited(error) ? 'A code was sent a moment ago. Check your email, or wait to ask again.' : mapAuthErrorMessage(error, 'Could not send a new code. Try again.'),
      });
    }
  };

  if (pendingPassword) {
    return (
      <ScreenScaffold>
        <Text style={styles.text}>You signed in a while ago, so a 6-digit code was emailed to you. Enter it to confirm the new password.</Text>
        <View>
          <CodeField label="Code from your email" value={code} onChange={setCode} onComplete={confirm} error={submitError ?? undefined} />
          <Text style={styles.helper}>Check your spam folder. The code works for 15 minutes.</Text>
        </View>
        <Button label="Confirm new password" size="lg" loading={confirming} disabled={code.length !== 6} onPress={() => confirm(code)} />
        <View style={styles.resend}>
          {remaining > 0 ? (
            <Text style={styles.text}>{`Send a new code in ${formatCountdown(remaining)}`}</Text>
          ) : (
            <Button label="Send a new code" variant="secondary" fullWidth={false} loading={reauthenticate.isPending} onPress={resend} />
          )}
          {resendResult ? (
            <Text style={[styles.result, resendResult.ok ? styles.ok : styles.fail]} accessibilityLiveRegion="polite">
              {resendResult.text}
            </Text>
          ) : null}
        </View>
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold>
      <Controller
        control={control}
        name="password"
        render={({ field: { ref, onChange, onBlur, value } }) => (
          <TextField
            ref={ref}
            label="New password"
            helper={PASSWORD_HELPER}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={handleSubmit(submit)}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.password?.message}
          />
        )}
      />

      {submitError ? <Banner tone="danger" title={submitError} /> : null}

      <Button label="Update password" size="lg" loading={isSubmitting || reauthenticate.isPending} onPress={handleSubmit(submit)} />
    </ScreenScaffold>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    text: { ...typography.body, color: colors.ink2 },
    helper: { ...typography.caption, color: colors.ink3 },
    resend: { gap: space[2], alignItems: 'flex-start' },
    result: { ...typography.caption },
    ok: { color: colors.status.success.ink },
    fail: { color: colors.status.danger.ink },
  });
}
