import { zodResolver } from '@hookform/resolvers/zod';
import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { z } from 'zod';
import { Button, Input } from '../../components/ui';
import { AUTH_ROUTES } from '../../constants/routes';
import { signIn } from '../../services/modules/auth/authService';
import { lightTheme } from '../../theme';
import type { AuthScreenProps } from '../../navigation/stacks/AuthNavigator';

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const { colors, spacing, typography } = lightTheme;

export function LoginScreen({ navigation }: AuthScreenProps<'Login'>) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setSubmitError(null);
    try {
      await signIn(values);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to sign in');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to your ZaraiLink account</Text>

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

        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label="Password"
              secureTextEntry
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.password?.message}
            />
          )}
        />

        {submitError ? <Text style={styles.errorBanner}>{submitError}</Text> : null}

        <Button
          label="Sign In"
          loading={isSubmitting}
          onPress={handleSubmit(onSubmit)}
          style={styles.submit}
        />

        <TouchableOpacity onPress={() => navigation.navigate(AUTH_ROUTES.ForgotPassword)}>
          <Text style={styles.link}>Forgot your password?</Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account?</Text>
          <TouchableOpacity onPress={() => navigation.navigate(AUTH_ROUTES.Register)}>
            <Text style={styles.link}> Sign up</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
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
    marginTop: spacing.lg,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  footerText: {
    color: colors.neutral.gray500,
  },
});
