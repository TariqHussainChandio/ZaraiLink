import { zodResolver } from '@hookform/resolvers/zod';
import { AuthError } from '@supabase/supabase-js';
import React, { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';
import { Banner, Button, TextField } from '../../components';
import { useRequestReauthentication, useUpdatePassword } from '../hooks/profile';
import { useTheme, type Theme } from '../../../theme';
import { mapPasswordFlowErrorMessage } from '../../auth';
import type { ProfileScreenProps } from '../../../navigation/stacks/ProfileNavigator';

// Supabase's own password rule (supabase/config.toml), checked first only to answer sooner.
const PASSWORD_RULE = 'Use at least 8 characters, with letters and numbers';

function makeChangePasswordSchema() {
  return z
    .object({
      password: z.string().min(8, PASSWORD_RULE).regex(/[A-Za-z]/, PASSWORD_RULE).regex(/\d/, PASSWORD_RULE),
      confirmPassword: z.string(),
    })
    .refine(data => data.password === data.confirmPassword, {
      message: "Passwords don't match",
      path: ['confirmPassword'],
    });
}

type ChangePasswordFormValues = z.infer<ReturnType<typeof makeChangePasswordSchema>>;

/**
 * The new password, and then, only when Supabase asks for it, the code it emails to confirm the account's owner (A3a).
 * The project requires that code for a session older than a day (secure_password_change, answered with
 * `reauthentication_needed`); for a fresher session Supabase ignores the code, so asking for one would be a step that
 * checks nothing (A3a verification, M1).
 */
export function ChangePasswordScreen({ navigation }: ProfileScreenProps<'ChangePassword'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { mutateAsync: updatePassword } = useUpdatePassword();
  const reauthenticate = useRequestReauthentication();
  const changePasswordSchema = useMemo(() => makeChangePasswordSchema(), []);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingPassword, setPendingPassword] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [confirming, setConfirming] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const done = () => {
    Alert.alert('Password updated', 'Your password has been changed.');
    navigation.goBack();
  };

  const submit = async (values: ChangePasswordFormValues) => {
    setSubmitError(null);
    try {
      await updatePassword(values.password);
      done();
    } catch (error) {
      if (!(error instanceof AuthError && error.code === 'reauthentication_needed')) {
        setSubmitError(mapPasswordFlowErrorMessage(error, 'Failed to update password'));
        return;
      }
      try {
        await reauthenticate.mutateAsync();
        setPendingPassword(values.password);
      } catch (sendError) {
        setSubmitError(mapPasswordFlowErrorMessage(sendError, 'Could not send the code'));
      }
    }
  };

  const confirm = async () => {
    if (!pendingPassword) return;
    setSubmitError(null);
    setConfirming(true);
    try {
      await updatePassword({ password: pendingPassword, nonce: code.trim() });
      done();
    } catch (error) {
      setSubmitError(mapPasswordFlowErrorMessage(error, 'Failed to update password'));
    } finally {
      setConfirming(false);
    }
  };

  if (pendingPassword) {
    return (
      <View style={styles.container}>
        <Text style={styles.subtitle}>
          You signed in a while ago, so we emailed you a 6-digit code. Enter it to confirm the new password.
        </Text>
        <TextField
          label="Code"
          keyboardType="number-pad"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChangeText={value => setCode(value.replace(/\D/g, ''))}
        />
        {submitError ? (
          <View style={styles.errorBanner}>
            <Banner tone="danger" title={submitError} />
          </View>
        ) : null}
        <Button
          label="Confirm new password"
          loading={confirming}
          disabled={code.length !== 6}
          onPress={confirm}
          style={styles.submit}
        />
        <Button
          label="Send a new code"
          variant="quiet"
          loading={reauthenticate.isPending}
          onPress={() => reauthenticate.mutate()}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.subtitle}>Choose a new password for your account.</Text>

      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="New password"
            helper="8 or more characters, with letters and numbers"
            secureTextEntry
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.password?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="confirmPassword"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Confirm new password"
            secureTextEntry
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.confirmPassword?.message}
          />
        )}
      />

      {submitError ? (
        <View style={styles.errorBanner}>
          <Banner tone="danger" title={submitError} />
        </View>
      ) : null}

      <Button
        label="Update Password"
        loading={isSubmitting || reauthenticate.isPending}
        onPress={handleSubmit(submit)}
        style={styles.submit}
      />
    </View>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
      padding: space[4],
    },
    subtitle: {
      ...typography.body,
      color: colors.ink2,
      marginBottom: space[6],
    },
    errorBanner: {
      marginBottom: space[3],
    },
    submit: {
      marginTop: space[2],
    },
  });
}
