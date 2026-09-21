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
import { signIn, type AuthChannel } from '../../services/modules/auth/authService';
import { useTheme, type Theme } from '../../theme';
import type { AuthScreenProps } from '../../navigation/stacks/AuthNavigator';
import type { TFunction } from 'i18next';

// Built from `t` at render time (not module scope) so validation messages stay in sync when the
// user switches language mid-session.
function makeLoginSchema(t: TFunction) {
  return z
    .object({
      channel: z.enum(['email', 'phone']),
      email: z.string().optional(),
      phone: z.string().nullable().optional(),
      password: z.string().min(6, t('auth.login.passwordMinLengthError')),
    })
    .superRefine((data, ctx) => {
      if (data.channel === 'email') {
        if (!data.email || !z.string().email().safeParse(data.email).success) {
          ctx.addIssue({ code: 'custom', path: ['email'], message: t('auth.login.invalidEmailError') });
        }
      } else if (!data.phone || !isValidE164(data.phone)) {
        ctx.addIssue({ code: 'custom', path: ['phone'], message: t('auth.login.invalidPhoneError') });
      }
    });
}

type LoginFormValues = z.infer<ReturnType<typeof makeLoginSchema>>;

export function LoginScreen({ navigation }: AuthScreenProps<'Login'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { t } = useTranslation();
  const loginSchema = useMemo(() => makeLoginSchema(t), [t]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { channel: 'email', email: '', phone: null, password: '' },
  });

  const channel = useWatch({ control, name: 'channel' }) as AuthChannel;

  const onSubmit = async (values: LoginFormValues) => {
    setSubmitError(null);
    try {
      const identifier = values.channel === 'email' ? values.email! : values.phone!;
      await signIn({ channel: values.channel, identifier, password: values.password });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : t('auth.login.defaultError'));
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('auth.login.title')}</Text>
        <Text style={styles.subtitle}>{t('auth.login.subtitle')}</Text>

        <Controller
          control={control}
          name="channel"
          render={({ field: { onChange, value } }) => (
            <View style={styles.channelRow}>
              {(['email', 'phone'] as const).map(option => (
                <TouchableOpacity
                  key={option}
                  style={[styles.channelChip, value === option && styles.channelChipSelected]}
                  onPress={() => onChange(option)}
                >
                  <Text
                    style={[
                      styles.channelChipLabel,
                      value === option && styles.channelChipLabelSelected,
                    ]}
                  >
                    {option === 'email' ? t('auth.login.emailChannel') : t('auth.login.phoneChannel')}
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
                label={t('auth.login.emailLabel')}
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

        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label={t('auth.login.passwordLabel')}
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
          label={t('auth.login.submitButton')}
          loading={isSubmitting}
          onPress={handleSubmit(onSubmit)}
          style={styles.submit}
        />

        <TouchableOpacity onPress={() => navigation.navigate(AUTH_ROUTES.ForgotPassword)}>
          <Text style={styles.link}>{t('auth.login.forgotPasswordLink')}</Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{t('auth.login.noAccountText')}</Text>
          <TouchableOpacity onPress={() => navigation.navigate(AUTH_ROUTES.Register)}>
            <Text style={styles.link}>{t('auth.login.signUpLink')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles({ colors, spacing, typography }: Theme) {
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
    submit: {
      marginTop: spacing.sm,
    },
    channelRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    channelChip: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
    },
    channelChipSelected: {
      backgroundColor: colors.brand.primary,
      borderColor: colors.brand.primary,
    },
    channelChipLabel: {
      color: colors.text.secondary,
      fontWeight: typography.weights.medium as any,
    },
    channelChipLabelSelected: {
      color: colors.neutral.white,
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
      color: colors.text.secondary,
    },
  });
}
