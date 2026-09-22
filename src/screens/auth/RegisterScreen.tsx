import { zodResolver } from '@hookform/resolvers/zod';
import React, { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
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
import { useTheme, type Theme } from '../../theme';
import type { AuthScreenProps } from '../../navigation/stacks/AuthNavigator';
import type { TFunction } from 'i18next';

const REGISTRABLE_ROLES = ROLES.filter(role => role !== 'admin') as Exclude<Role, 'admin'>[];

// Built from `t` at render time (not module scope) so validation messages stay in sync when the
// user switches language mid-session.
function makeRegisterSchema(t: TFunction) {
  return z
    .object({
      channel: z.enum(['email', 'phone']),
      fullName: z.string().min(2, t('auth.register.fullNameError')),
      email: z.string().optional(),
      phone: z.string().nullable().optional(),
      password: z.string().min(6, t('auth.register.passwordMinLengthError')),
      role: z.enum(REGISTRABLE_ROLES as [Role, ...Role[]], {
        message: t('auth.register.roleError'),
      }),
    })
    .superRefine((data, ctx) => {
      if (data.channel === 'email') {
        if (!data.email || !z.string().email().safeParse(data.email).success) {
          ctx.addIssue({ code: 'custom', path: ['email'], message: t('auth.register.invalidEmailError') });
        }
      } else if (!data.phone || !isValidE164(data.phone)) {
        ctx.addIssue({ code: 'custom', path: ['phone'], message: t('auth.register.invalidPhoneError') });
      }
    });
}

type RegisterFormValues = z.infer<ReturnType<typeof makeRegisterSchema>>;

export function RegisterScreen({ navigation }: AuthScreenProps<'Register'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { t } = useTranslation();
  const registerSchema = useMemo(() => makeRegisterSchema(t), [t]);
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
      setSubmitError(error instanceof Error ? error.message : t('auth.register.defaultError'));
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('auth.register.title')}</Text>
        <Text style={styles.subtitle}>{t('auth.register.subtitle')}</Text>

        <Controller
          control={control}
          name="fullName"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label={t('auth.register.fullNameLabel')}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.fullName?.message}
            />
          )}
        />

        <Text style={styles.label}>{t('auth.register.verifyWithLabel')}</Text>
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
                    {option === 'email' ? t('auth.register.emailChannel') : t('auth.register.phoneChannel')}
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
                label={t('auth.register.emailLabel')}
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
          {channel === 'email' ? t('auth.register.emailHint') : t('auth.register.phoneHint')}
        </Text>

        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label={t('auth.register.passwordLabel')}
              secureTextEntry
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.password?.message}
            />
          )}
        />

        <Text style={styles.label}>{t('auth.register.roleLabel')}</Text>
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
          label={t('auth.register.submitButton')}
          loading={isSubmitting}
          onPress={handleSubmit(onSubmit)}
          style={styles.submit}
        />

        <View style={styles.footer}>
          <Text style={styles.footerText}>{t('auth.register.haveAccountText')}</Text>
          <TouchableOpacity onPress={() => navigation.navigate(AUTH_ROUTES.Login)}>
            <Text style={styles.link}>{t('auth.register.signInLink')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles({ colors, spacing, radii, typography }: Theme) {
  return StyleSheet.create({
    flex: { flex: 1 },
    container: {
      flexGrow: 1,
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
    label: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.medium as any,
      color: colors.text.secondary,
      marginBottom: spacing.xs,
    },
    hint: {
      fontSize: typography.sizes.xs,
      color: colors.text.secondary,
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
      borderColor: colors.border,
    },
    roleChipSelected: {
      backgroundColor: colors.brand.primary,
      borderColor: colors.brand.primary,
    },
    roleChipLabel: {
      color: colors.text.secondary,
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
      color: colors.text.secondary,
    },
    link: {
      color: colors.brand.primary,
      fontWeight: typography.weights.semibold as any,
    },
  });
}
