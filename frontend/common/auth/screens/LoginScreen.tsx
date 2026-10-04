import { zodResolver } from '@hookform/resolvers/zod';
import React, { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';
import { Banner, Button, type ChipOption, ChipRow, isValidE164, PhoneInput, TextField } from '../../components';
import { AUTH_ROUTES } from '../../constants/routes';
import { useSignIn, type AuthChannel } from '../hooks/auth';
import { useTheme, type Theme } from '../../../theme';
import { mapPasswordFlowErrorMessage } from './mapAuthError';
import type { AuthScreenProps } from '../../../navigation/stacks/AuthNavigator';

const CHANNELS: ChipOption<AuthChannel>[] = [
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone number' },
];

function makeLoginSchema() {
  return z
    .object({
      channel: z.enum(['email', 'phone']),
      email: z.string().optional(),
      phone: z.string().nullable().optional(),
      password: z.string().min(6, 'Password must be at least 6 characters'),
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
}

type LoginFormValues = z.infer<ReturnType<typeof makeLoginSchema>>;

export function LoginScreen({ navigation }: AuthScreenProps<'Login'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { mutateAsync: signIn } = useSignIn();
  const loginSchema = useMemo(() => makeLoginSchema(), []);
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
      setSubmitError(mapPasswordFlowErrorMessage(error, 'Failed to sign in'));
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
          name="channel"
          render={({ field: { onChange, value } }) => <ChipRow options={CHANNELS} value={value} onChange={onChange} />}
        />

        {channel === 'email' ? (
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
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

        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Password"
              secureTextEntry
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.password?.message}
            />
          )}
        />

        {submitError ? (

          <View style={styles.errorBanner}>

            <Banner tone="danger" title={submitError} />

          </View>

        ) : null}

        <Button
          label="Sign In"
          loading={isSubmitting}
          onPress={handleSubmit(onSubmit)}
          style={styles.submit}
        />

        <View style={styles.links}>
          <Button label="Forgot your password?" variant="quiet" fullWidth={false} onPress={() => navigation.navigate(AUTH_ROUTES.ForgotPassword)} />
          <View style={styles.footer}>
            <Text style={styles.footerText}>{"Don't have an account?"}</Text>
            <Button label="Sign up" variant="quiet" fullWidth={false} onPress={() => navigation.navigate(AUTH_ROUTES.Register)} />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    flex: { flex: 1 },
    container: {
      flexGrow: 1,
      justifyContent: 'center',
      padding: space[6],
    },
    title: {
      ...typography.display,
      color: colors.ink,
    },
    subtitle: {
      ...typography.body,
      color: colors.ink2,
      marginTop: space[1],
      marginBottom: space[6],
    },
    submit: {
      marginTop: space[2],
    },
    errorBanner: {
      marginBottom: space[3],
    },
    links: {
      alignItems: 'center',
      marginTop: space[4],
      gap: space[2],
    },
    footer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space[1],
    },
    footerText: {
      ...typography.body,
      color: colors.ink2,
    },
  });
}
