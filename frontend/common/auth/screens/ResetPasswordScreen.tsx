import { zodResolver } from '@hookform/resolvers/zod';
import React, { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';
import { Button, Input } from '../../components';
import { useUpdatePassword } from '../../profile';
import { useTheme, type Theme } from '../../../theme';
import { mapPasswordFlowErrorMessage } from './mapAuthError';

function makeResetPasswordSchema() {
  return z
    .object({
      password: z.string().min(6, 'Password must be at least 6 characters'),
      confirmPassword: z.string(),
    })
    .refine(data => data.password === data.confirmPassword, {
      message: "Passwords don't match",
      path: ['confirmPassword'],
    });
}

type ResetPasswordFormValues = z.infer<ReturnType<typeof makeResetPasswordSchema>>;

// Rendered directly by RootNavigator when authStore's status is 'passwordRecovery' (a
// password-reset email link was just exchanged for a session) — no navigation props, no route
// params, unlike ChangePasswordScreen (its already-authenticated, Settings-reached counterpart).
// On success, `updatePassword` triggers a USER_UPDATED auth event that authStore's existing
// applySession path picks up automatically, flipping status to 'authenticated' — RootNavigator
// then swaps to the normal app shell with no further action needed here.
export function ResetPasswordScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const resetPasswordSchema = useMemo(() => makeResetPasswordSchema(), []);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const updatePassword = useUpdatePassword();
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const onSubmit = async (values: ResetPasswordFormValues) => {
    setSubmitError(null);
    try {
      await updatePassword.mutateAsync(values.password);
    } catch (error) {
      setSubmitError(mapPasswordFlowErrorMessage(error, 'Failed to update password'));
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Set a new password</Text>
      <Text style={styles.subtitle}>Choose a new password for your ZaraiLink account.</Text>

      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            label="New password"
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
          <Input
            label="Confirm password"
            secureTextEntry
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.confirmPassword?.message}
          />
        )}
      />

      {submitError ? <Text style={styles.errorBanner}>{submitError}</Text> : null}

      <Button
        label="Update password"
        loading={isSubmitting}
        onPress={handleSubmit(onSubmit)}
        style={styles.submit}
      />
    </View>
  );
}

function makeStyles({ colors, spacing, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      backgroundColor: colors.background.surface,
      padding: spacing.lg,
    },
    title: {
      fontSize: typography.sizes['2xl'],
      fontWeight: typography.weights.bold,
      color: colors.text.primary,
      marginBottom: spacing.sm,
    },
    subtitle: {
      fontSize: typography.sizes.base,
      color: colors.text.secondary,
      marginBottom: spacing.xl,
    },
    errorBanner: {
      color: colors.semantic.error,
      marginBottom: spacing.md,
    },
    submit: {
      marginTop: spacing.sm,
    },
  });
}
