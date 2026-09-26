import { zodResolver } from '@hookform/resolvers/zod';
import React, { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';
import { Button, Input } from '../../components/ui';
import { useUpdatePassword } from '../../hooks/api/profile';
import { useTheme, type Theme } from '../../theme';
import { mapPasswordFlowErrorMessage } from '../auth/mapAuthError';
import type { ProfileScreenProps } from '../../navigation/stacks/ProfileNavigator';

function makeChangePasswordSchema() {
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

type ChangePasswordFormValues = z.infer<ReturnType<typeof makeChangePasswordSchema>>;

export function ChangePasswordScreen({ navigation }: ProfileScreenProps<'ChangePassword'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { mutateAsync: updatePassword } = useUpdatePassword();
  const changePasswordSchema = useMemo(() => makeChangePasswordSchema(), []);
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
      Alert.alert('Password updated', 'Your password has been changed.');
      navigation.goBack();
    } catch (error) {
      setSubmitError(mapPasswordFlowErrorMessage(error, 'Failed to update password'));
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.subtitle}>Choose a new password for your account.</Text>

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
            label="Confirm new password"
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
        label="Update Password"
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
