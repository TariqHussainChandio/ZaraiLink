import { zodResolver } from '@hookform/resolvers/zod';
import React, { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { z } from 'zod';
import { Button, Input } from '../../components/ui';
import { AUTH_ROUTES } from '../../constants/routes';
import { useResetPassword } from '../../hooks/api/auth';
import { useTheme, type Theme } from '../../theme';
import { mapPasswordFlowErrorMessage } from './mapAuthError';
import type { AuthScreenProps } from '../../navigation/stacks/AuthNavigator';

function makeForgotPasswordSchema() {
  return z.object({
    email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  });
}

type ForgotPasswordFormValues = z.infer<ReturnType<typeof makeForgotPasswordSchema>>;

export function ForgotPasswordScreen({ navigation }: AuthScreenProps<'ForgotPassword'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { mutateAsync: resetPassword } = useResetPassword();
  const forgotPasswordSchema = useMemo(() => makeForgotPasswordSchema(), []);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  // P4 (4B.4): a numeric code (VerifyOtpScreen), not a link — resetPassword() no longer takes a
  // redirectTo, so there's nothing to wait for here; move straight to entering the code.
  const onSubmit = async (values: ForgotPasswordFormValues) => {
    setSubmitError(null);
    try {
      await resetPassword(values.email);
      navigation.navigate(AUTH_ROUTES.VerifyOtp, { purpose: 'recovery', identifier: values.email });
    } catch (error) {
      setSubmitError(mapPasswordFlowErrorMessage(error, 'Failed to send reset email'));
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Reset your password</Text>
      <Text style={styles.subtitle}>{"Enter your account email and we'll send you a reset code."}</Text>

      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            label="Email"
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
        label="Send code"
        loading={isSubmitting}
        onPress={handleSubmit(onSubmit)}
        style={styles.submit}
      />

      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.link}>Back to sign in</Text>
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
      fontWeight: typography.weights.bold,
      color: colors.text.primary,
    },
    subtitle: {
      fontSize: typography.sizes.base,
      color: colors.text.secondary,
      marginTop: spacing.xs,
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
      fontWeight: typography.weights.semibold,
      marginTop: spacing.xl,
      textAlign: 'center',
    },
  });
}
