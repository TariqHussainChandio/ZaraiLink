import { zodResolver } from '@hookform/resolvers/zod';
import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { z } from 'zod';
import { Button, Input } from '../../components/ui';
import { resetPassword } from '../../services/modules/auth/authService';
import { lightTheme } from '../../theme';
import type { AuthScreenProps } from '../../navigation/stacks/AuthNavigator';

const forgotPasswordSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

const { colors, spacing, typography } = lightTheme;

export function ForgotPasswordScreen({ navigation }: AuthScreenProps<'ForgotPassword'>) {
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
      setSubmitError(error instanceof Error ? error.message : 'Failed to send reset email');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Reset your password</Text>
      <Text style={styles.subtitle}>
        Enter your account email and we'll send you a reset link.
      </Text>

      {sent ? (
        <Text style={styles.success}>Check your email for a password reset link.</Text>
      ) : (
        <>
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
            label="Send reset link"
            loading={isSubmitting}
            onPress={handleSubmit(onSubmit)}
            style={styles.submit}
          />
        </>
      )}

      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.link}>Back to sign in</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  title: {
    fontSize: typography.sizes['3xl'],
    fontWeight: typography.weights.bold as any,
    color: colors.neutral.gray900,
  },
  subtitle: {
    fontSize: typography.sizes.base,
    color: colors.neutral.gray500,
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
