import { zodResolver } from '@hookform/resolvers/zod';
import React, { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';
import { Button, Input } from '../../components/ui';
import { updatePassword } from '../../services/modules/profile/profileService';
import { useTheme, type Theme } from '../../theme';
import type { TFunction } from 'i18next';

// Built from `t` at render time (not module scope) so validation messages stay in sync when the
// user switches language mid-session — same pattern as ChangePasswordScreen's schema.
function makeResetPasswordSchema(t: TFunction) {
  return z
    .object({
      password: z.string().min(6, t('auth.resetPassword.passwordMinLengthError')),
      confirmPassword: z.string(),
    })
    .refine(data => data.password === data.confirmPassword, {
      message: t('auth.resetPassword.passwordsMismatchError'),
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
  const { t } = useTranslation();
  const resetPasswordSchema = useMemo(() => makeResetPasswordSchema(t), [t]);
  const [submitError, setSubmitError] = useState<string | null>(null);
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
      await updatePassword(values.password);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : t('auth.resetPassword.defaultError'));
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('auth.resetPassword.title')}</Text>
      <Text style={styles.subtitle}>{t('auth.resetPassword.subtitle')}</Text>

      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            label={t('auth.resetPassword.newPasswordLabel')}
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
            label={t('auth.resetPassword.confirmPasswordLabel')}
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
        label={t('auth.resetPassword.submitButton')}
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
      fontWeight: typography.weights.bold as any,
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
