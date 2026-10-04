import { zodResolver } from '@hookform/resolvers/zod';
import React, { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';
import { Banner, Button, type ChipOption, ChipRow, TextField } from '../../components';
import { AUTH_ROUTES } from '../../constants/routes';
import { ROLE_LABELS, ROLES, type Role } from '../../constants/roles';
import { useSignUp } from '../hooks/auth';
import { useTheme, type Theme } from '../../../theme';
import { mapPasswordFlowErrorMessage } from './mapAuthError';
import type { AuthScreenProps } from '../../../navigation/stacks/AuthNavigator';

const REGISTRABLE_ROLES = ROLES.filter(role => role !== 'admin') as Exclude<Role, 'admin'>[];
const ROLE_OPTIONS: ChipOption<Exclude<Role, 'admin'>>[] = REGISTRABLE_ROLES.map(role => ({ value: role, label: ROLE_LABELS[role] }));
// Supabase's own password rule (supabase/config.toml: minimum_password_length 8, password_requirements
// letters_digits); checked here first only to answer sooner, Supabase still decides.
const PASSWORD_RULE = 'Use at least 8 characters, with letters and numbers';
const PASSWORD_HELP = '8 or more characters, with letters and numbers';

function makeRegisterSchema() {
  return z.object({
    fullName: z.string().trim().min(2, 'Enter your full name'),
    email: z.string().trim().email('Enter a valid email'),
    password: z
      .string()
      .min(8, PASSWORD_RULE)
      .regex(/[A-Za-z]/, PASSWORD_RULE)
      .regex(/\d/, PASSWORD_RULE),
    role: z.enum(REGISTRABLE_ROLES as [Role, ...Role[]], {
      message: 'Select a role',
    }),
  });
}

type RegisterFormValues = z.infer<ReturnType<typeof makeRegisterSchema>>;

export function RegisterScreen({ navigation }: AuthScreenProps<'Register'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { mutateAsync: signUp } = useSignUp();
  const registerSchema = useMemo(() => makeRegisterSchema(), []);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: '', email: '', password: '', role: 'farmer' },
  });

  const role = useWatch({ control, name: 'role' });
  const reviewed = role === 'dealer' || role === 'expert';

  const onSubmit = async (values: RegisterFormValues) => {
    setSubmitError(null);
    try {
      const email = values.email.trim();
      const { session } = await signUp({
        email,
        password: values.password,
        fullName: values.fullName.trim(),
        role: values.role,
      });
      // No session back means the OTP must be confirmed before sign-in; authStore's
      // onAuthStateChange picks up the session automatically once verifyOtp succeeds.
      if (!session) {
        navigation.navigate(AUTH_ROUTES.VerifyOtp, { purpose: 'signup', email });
      }
    } catch (error) {
      setSubmitError(mapPasswordFlowErrorMessage(error, 'Failed to create account'));
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
            <TextField
              label="Full name"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.fullName?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
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

        <Text style={styles.hint}>We&apos;ll email you a 6-digit code to verify your account.</Text>

        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Password"
              helper={PASSWORD_HELP}
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
            <ChipRow options={ROLE_OPTIONS} value={value} onChange={onChange} />
          )}
        />
        {errors.role?.message ? <Text style={styles.errorText}>{errors.role.message}</Text> : null}
        {reviewed ? (
          <Banner tone="info">
            An administrator reviews every dealer and expert account. You can use it once it is approved.
          </Banner>
        ) : null}

        {submitError ? (

          <View style={styles.errorBanner}>

            <Banner tone="danger" title={submitError} />

          </View>

        ) : null}

        <Button
          label="Create account"
          loading={isSubmitting}
          onPress={handleSubmit(onSubmit)}
          style={styles.submit}
        />

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account?</Text>
          <Button label="Sign in" variant="quiet" fullWidth={false} onPress={() => navigation.navigate(AUTH_ROUTES.Login)} />
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
    label: {
      ...typography.caption,
      color: colors.ink2,
      marginBottom: space[1],
    },
    hint: {
      ...typography.caption,
      color: colors.ink2,
      marginTop: -space[2],
      marginBottom: space[3],
    },
    errorText: {
      color: colors.status.danger.mark,
      ...typography.caption,
      marginBottom: space[3],
    },
    submit: {
      marginTop: space[2],
    },
    errorBanner: {
      marginBottom: space[3],
    },
    footer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space[1],
      marginTop: space[4],
    },
    footerText: {
      ...typography.body,
      color: colors.ink2,
    },
  });
}
