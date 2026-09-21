import { zodResolver } from '@hookform/resolvers/zod';
import React, { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { z } from 'zod';
import { Button, Input } from '../../components/ui';
import { resetPassword } from '../../services/modules/auth/authService';
import { useTheme, type Theme } from '../../theme';
import type { AuthScreenProps } from '../../navigation/stacks/AuthNavigator';
import type { TFunction } from 'i18next';

// Built from `t` at render time (not module scope) so validation messages stay in sync when the
// user switches language mid-session.
function makeForgotPasswordSchema(t: TFunction) {
  return z.object({
    email: z.string().min(1, t('auth.forgotPassword.emailRequiredError')).email(t('auth.forgotPassword.invalidEmailError')),
  });
}

type ForgotPasswordFormValues = z.infer<ReturnType<typeof makeForgotPasswordSchema>>;

export function ForgotPasswordScreen({ navigation }: AuthScreenProps<'ForgotPassword'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { t } = useTranslation();
  const forgotPasswordSchema = useMemo(() => makeForgotPasswordSchema(t), [t]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (values: ForgotPasswordFormValues) => {
    setSubmitError(null);
    try {
      await resetPassword(values.email);
      setSent(true);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : t('auth.forgotPassword.defaultError'));
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('auth.forgotPassword.title')}</Text>
      <Text style={styles.subtitle}>{t('auth.forgotPassword.subtitle')}</Text>

      {sent ? (
        <Text style={styles.success}>{t('auth.forgotPassword.successMessage')}</Text>
      ) : (
        <>
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label={t('auth.forgotPassword.emailLabel')}
                autoCapitalize="none"
                keyboardType="email-address"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.email?.message}
              />
            )}
          />

          {submitError ? <Text style={styles.errorBanner}>{submitError}</Text> : null}

          <Button
            label={t('auth.forgotPassword.submitButton')}
            loading={isSubmitting}
            onPress={handleSubmit(onSubmit)}
            style={styles.submit}
          />
        </>
      )}

      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.link}>{t('auth.forgotPassword.backLink')}</Text>
      </TouchableOpacity>
    </View>
  );
}

function makeStyles({ colors, spacing, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      padding: spacing.xl,
    },
    title: {
      fontSize: typography.sizes['3xl'],
      fontWeight: typography.weights.bold as any,
      color: colors.text.primary,
    },
    subtitle: {
      fontSize: typography.sizes.base,
      color: colors.text.secondary,
      marginTop: spacing.xs,
      marginBottom: spacing.xl,
    },
    success: {
      color: colors.semantic.success,
      marginBottom: spacing.xl,
    },
    submit: {
      marginTop: spacing.sm,
    },
    errorBanner: {
      color: colors.semantic.error,
      marginBottom: spacing.md,
    },
    link: {
      color: colors.brand.primary,
      fontWeight: typography.weights.semibold as any,
      marginTop: spacing.xl,
      textAlign: 'center',
    },
  });
}
