import { zodResolver } from '@hookform/resolvers/zod';
import React, { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
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
import { Button, Input, PhoneInput, isValidE164 } from '../../components/ui';
import { AUTH_ROUTES } from '../../constants/routes';
import { ROLE_LABELS, ROLES, type Role } from '../../constants/roles';
import { signUp, type AuthChannel } from '../../services/modules/auth/authService';
import { lightTheme } from '../../theme';
import type { AuthScreenProps } from '../../navigation/stacks/AuthNavigator';

const REGISTRABLE_ROLES = ROLES.filter(role => role !== 'admin') as Exclude<Role, 'admin'>[];

const registerSchema = z
  .object({
    channel: z.enum(['email', 'phone']),
    fullName: z.string().min(2, 'Enter your full name'),
    email: z.string().optional(),
    phone: z.string().nullable().optional(),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    role: z.enum(REGISTRABLE_ROLES as [Role, ...Role[]], {
      message: 'Select a role',
    }),
  })
  .superRefine((data, ctx) => {
    if (data.channel === 'email') {
      if (!data.email || !z.string().email().safeParse(data.email).success) {
        ctx.addIssue({ code: 'custom', path: ['email'], message: 'Enter a valid email' });
      }
    } else if (!data.phone || !isValidE164(data.phone)) {
      ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Enter a valid phone number' });
    }
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

const { colors, spacing, radii, typography } = lightTheme;

export function RegisterScreen({ navigation }: AuthScreenProps<'Register'>) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { channel: 'email', fullName: '', email: '', phone: null, password: '', role: 'farmer' },
  });

  const channel = useWatch({ control, name: 'channel' }) as AuthChannel;

  const onSubmit = async (values: RegisterFormValues) => {
    setSubmitError(null);
    try {
      const identifier = values.channel === 'email' ? values.email! : values.phone!;
      const { session } = await signUp({
        channel: values.channel,
        identifier,
        password: values.password,
        fullName: values.fullName,
        role: values.role,
      });
      // No session back means the OTP must be confirmed before sign-in; authStore's
      // onAuthStateChange picks up the session automatically once verifyOtp succeeds.
      if (!session) {
        navigation.navigate(AUTH_ROUTES.VerifyOtp, { channel: values.channel, identifier });
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to create account');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>Join ZaraiLink as a farmer, buyer, dealer, or expert</Text>

        <Controller
          control={control}
          name="fullName"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label="Full name"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.fullName?.message}
            />
          )}
        />

        <Text style={styles.label}>Verify with</Text>
        <Controller
          control={control}
          name="channel"
          render={({ field: { onChange, value } }) => (
            <View style={styles.roleRow}>
              {(['email', 'phone'] as const).map(option => (
                <TouchableOpacity
                  key={option}
                  style={[styles.roleChip, value === option && styles.roleChipSelected]}
                  onPress={() => onChange(option)}
                >
                  <Text
                    style={[styles.roleChipLabel, value === option && styles.roleChipLabelSelected]}
                  >
                    {option === 'email' ? 'Email' : 'Phone number'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        />

        {channel === 'email' ? (
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Email"
                autoCapitalize="none"
                keyboardType="email-address"
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.email?.message}
              />
            )}
          />
        ) : (
          <Controller
            control={control}
            name="phone"
            render={({ field: { onChange, value } }) => (
              <PhoneInput value={value ?? null} onChange={onChange} error={errors.phone?.message} />
            )}
          />
        )}

        <Text style={styles.hint}>
          {channel === 'email'
            ? "We'll email you a 6-digit code to verify your account."
            : "We'll text you a 6-digit code to verify your account."}
        </Text>

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

        <Text style={styles.label}>I am a...</Text>
        <Controller
          control={control}
          name="role"
          render={({ field: { onChange, value } }) => (
            <View style={styles.roleRow}>
              {REGISTRABLE_ROLES.map(role => (
                <TouchableOpacity
                  key={role}
                  style={[styles.roleChip, value === role && styles.roleChipSelected]}
                  onPress={() => onChange(role)}
                >
                  <Text
                    style={[
                      styles.roleChipLabel,
                      value === role && styles.roleChipLabelSelected,
                    ]}
                  >
                    {ROLE_LABELS[role]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        />
        {errors.role?.message ? <Text style={styles.errorText}>{errors.role.message}</Text> : null}

        {submitError ? <Text style={styles.errorBanner}>{submitError}</Text> : null}

        <Button
          label="Create account"
          loading={isSubmitting}
          onPress={handleSubmit(onSubmit)}
          style={styles.submit}
        />

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account?</Text>
          <TouchableOpacity onPress={() => navigation.navigate(AUTH_ROUTES.Login)}>
            <Text style={styles.link}> Sign in</Text>
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
  label: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium as any,
    color: colors.neutral.gray700,
    marginBottom: spacing.xs,
  },
  hint: {
    fontSize: typography.sizes.xs,
    color: colors.neutral.gray500,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },
  roleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  roleChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.neutral.gray300,
  },
  roleChipSelected: {
    backgroundColor: colors.brand.primary,
    borderColor: colors.brand.primary,
  },
  roleChipLabel: {
    color: colors.neutral.gray700,
    fontWeight: typography.weights.medium as any,
  },
  roleChipLabelSelected: {
    color: colors.neutral.white,
  },
  errorText: {
    color: colors.semantic.error,
    fontSize: typography.sizes.xs,
    marginBottom: spacing.md,
  },
  submit: {
    marginTop: spacing.sm,
  },
  errorBanner: {
    color: colors.semantic.error,
    marginBottom: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  footerText: {
    color: colors.neutral.gray500,
  },
  link: {
    color: colors.brand.primary,
    fontWeight: typography.weights.semibold as any,
  },
});
