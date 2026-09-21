import { zodResolver } from '@hookform/resolvers/zod';
import React, { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';
import { Button, Input } from '../../components/ui';
import { updatePassword } from '../../services/modules/profile/profileService';
import { useTheme, type Theme } from '../../theme';
import type { ProfileScreenProps } from '../../navigation/stacks/ProfileNavigator';
import type { TFunction } from 'i18next';

// Built from `t` at render time (not module scope) so validation messages stay in sync when the
// user switches language mid-session.
function makeChangePasswordSchema(t: TFunction) {
  return z
    .object({
      password: z.string().min(6, t('profile.passwordMinLengthError')),
      confirmPassword: z.string(),
    })
    .refine(data => data.password === data.confirmPassword, {
      message: t('profile.passwordsMismatchError'),
      path: ['confirmPassword'],
    });
}

type ChangePasswordFormValues = z.infer<ReturnType<typeof makeChangePasswordSchema>>;

export function ChangePasswordScreen({ navigation }: ProfileScreenProps<'ChangePassword'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { t } = useTranslation();
  const changePasswordSchema = useMemo(() => makeChangePasswordSchema(t), [t]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const onSubmit = async (values: ChangePasswordFormValues) => {
    setSubmitError(null);
    try {
      await updatePassword(values.password);
      Alert.alert(t('profile.passwordUpdatedTitle'), t('profile.passwordUpdatedMessage'));
      navigation.goBack();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : t('profile.updatePasswordError'));
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.subtitle}>{t('profile.changePasswordSubtitle')}</Text>

      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            label={t('profile.newPasswordLabel')}
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
            label={t('profile.confirmPasswordLabel')}
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
        label={t('profile.updatePasswordButton')}
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
      backgroundColor: colors.background.surface,
      padding: spacing.lg,
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
