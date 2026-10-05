import { zodResolver } from '@hookform/resolvers/zod';
import React, { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';
import { Banner, Button, isValidE164, LocationPicker, PhoneInput, TextField } from '../../components';
import { AUTH_ROUTES } from '../../constants/routes';
import { useSignUp } from '../hooks/auth';
import { useTheme, type Theme } from '../../../theme';
import { mapPasswordFlowErrorMessage } from './mapAuthError';
import type { AuthScreenProps } from '../../../navigation/stacks/AuthNavigator';

import type { RegistrableRole } from '../../constants/roles';

// SRDS §5–§7, §10: who is asked for what. A farmer and a buyer give their location here (a farmer their village too); a
// dealer's business location and an expert's professional details come in their application, after the email code.
const TITLES: Record<RegistrableRole, string> = {
  farmer: 'Create a farmer account',
  buyer: 'Create a buyer account',
  dealer: 'Create a dealer account',
  expert: 'Create an expert account',
};
// Supabase's own password rule (supabase/config.toml: minimum_password_length 8, password_requirements
// letters_digits); checked here first only to answer sooner, Supabase still decides.
const PASSWORD_RULE = 'Use at least 8 characters, with letters and numbers';
const PASSWORD_HELP = '8 or more characters, with letters and numbers';

function makeRegisterSchema(role: RegistrableRole) {
  const located = role === 'farmer' || role === 'buyer';
  const place = (message: string) => (located ? z.string().trim().min(2, message) : z.string().trim());
  return z.object({
    fullName: z.string().trim().min(2, 'Enter your full name'),
    email: z.string().trim().email('Enter a valid email'),
    phone: z
      .string()
      .trim()
      .refine(isValidE164, 'Enter your number with the country code, like +923001234567'),
    password: z
      .string()
      .min(8, PASSWORD_RULE)
      .regex(/[A-Za-z]/, PASSWORD_RULE)
      .regex(/\d/, PASSWORD_RULE),
    country: place('Enter your country'),
    province: place('Enter your province'),
    city: place('Enter your city'),
    street: place('Enter your address'),
    village: role === 'farmer' ? z.string().trim().min(2, 'Enter your village') : z.string().trim(),
  });
}

type RegisterFormValues = z.infer<ReturnType<typeof makeRegisterSchema>>;

export function RegisterScreen({ navigation, route }: AuthScreenProps<'Register'>) {
  const { role } = route.params;
  const located = role === 'farmer' || role === 'buyer';
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { mutateAsync: signUp } = useSignUp();
  const registerSchema = useMemo(() => makeRegisterSchema(role), [role]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: '', email: '', phone: '', password: '', country: '', province: '', city: '', street: '', village: '' },
  });

  const reviewed = role === 'dealer' || role === 'expert';

  const onSubmit = async (values: RegisterFormValues) => {
    setSubmitError(null);
    try {
      const email = values.email.trim();
      const { session } = await signUp({
        email,
        password: values.password,
        fullName: values.fullName.trim(),
        role,
        phone: values.phone,
        ...(located ? { country: values.country, province: values.province, city: values.city, street: values.street } : {}),
        ...(role === 'farmer' ? { village: values.village } : {}),
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
        <Text style={styles.title} accessibilityRole="header">
          {TITLES[role]}
        </Text>
        <Button
          label="Choose a different account type"
          variant="quiet"
          fullWidth={false}
          onPress={() => navigation.navigate(AUTH_ROUTES.CreateAccount)}
          style={styles.change}
        />

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
          name="phone"
          render={({ field: { onChange, value } }) => (
            <PhoneInput value={value || null} onChange={next => onChange(next ?? '')} error={errors.phone?.message} />
          )}
        />

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

        {located ? (
          <>
            <LocationPicker
              country={watch('country') || null}
              province={watch('province') || null}
              city={watch('city') || null}
              onCountryChange={value => setValue('country', value ?? '')}
              onProvinceChange={value => setValue('province', value ?? '')}
              onCityChange={value => setValue('city', value ?? '')}
            />
            {errors.country || errors.province || errors.city ? (
              <Text style={styles.errorText}>Enter your country, province and city</Text>
            ) : null}
            {role === 'farmer' ? (
              <Controller
                control={control}
                name="village"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextField label="Village" value={value} onChangeText={onChange} onBlur={onBlur} error={errors.village?.message} />
                )}
              />
            ) : null}
            <Controller
              control={control}
              name="street"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField label="Address" value={value} onChangeText={onChange} onBlur={onBlur} error={errors.street?.message} />
              )}
            />
          </>
        ) : null}
        {reviewed ? (
          <Banner tone="info">
            {`After the email code you will send your ${role === 'dealer' ? 'business' : 'professional'} details and documents. An administrator reviews them before the account can be used.`}
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
    change: {
      alignSelf: 'flex-start',
      marginBottom: space[4],
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
