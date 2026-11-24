// Registration form for the chosen role: name, phone, location, email and password.
import { zodResolver } from '@hookform/resolvers/zod';
import React, { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';
import { Banner, Button, isValidE164, LocationPicker, PhoneInput, TextField } from '../../components';
import { COUNTRY } from '../../constants/locations';
import type { RegistrableRole } from '../../constants/roles';
import { AUTH_ROUTES } from '../../constants/routes';
import { emailSchema } from '../../validation/email';
import { newPasswordSchema, PASSWORD_HELPER } from '../../validation/password';
import { personNameSchema } from '../../validation/personName';
import { useSignUp } from '../hooks/auth';
import { AuthScreen } from '../components/AuthScreen';
import { FormErrorSummary } from '../components/FormErrorSummary';
import { useTheme, type Theme } from '../../../theme';
import { mapPasswordFlowErrorMessage } from './mapAuthError';
import type { AuthScreenProps } from '../../../navigation/stacks/AuthNavigator';

// SRDS §5–§7, §10: who is asked for what. A farmer and a buyer give their location here (a farmer their village too); a
// dealer's business location and an expert's professional details come in their application, after the email code.
const TITLES: Record<RegistrableRole, string> = {
  farmer: 'Create a farmer account',
  buyer: 'Create a buyer account',
  dealer: 'Create a dealer account',
  expert: 'Create an expert account',
};

// Builds the form rules for the role; farmers and buyers must give a location.
function makeRegisterSchema(role: RegistrableRole) {
  const located = role === 'farmer' || role === 'buyer';
  const place = (message: string) => (located ? z.string().trim().min(2, message) : z.string().trim());
  return z.object({
    fullName: personNameSchema,
    email: emailSchema,
    phone: z
      .string()
      .trim()
      .refine(isValidE164, 'Enter a phone number like 0300 1234567'),
    password: newPasswordSchema,
    province: place('Choose your province'),
    city: place('Enter your city'),
    street: place('Enter your address'),
    village: role === 'farmer' ? z.string().trim().min(2, 'Enter your village') : z.string().trim(),
  });
}

type RegisterFormValues = z.infer<ReturnType<typeof makeRegisterSchema>>;

// Sign-up screen for one role; on success opens the email code screen.
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
    setFocus,
    setValue,
    watch,
    formState: { errors, isSubmitting, submitCount },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    // D20: each field is checked as it is typed, so "Numbers and special characters are not allowed" appears under the
    // name the moment a digit goes in, not only after Create account.
    mode: 'onChange',
    defaultValues: { fullName: '', email: '', phone: '', password: '', province: '', city: '', street: '', village: '' },
  });

  const reviewed = role === 'dealer' || role === 'expert';

  // Creates the account, then opens the email code screen if a code is needed.
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
        // The country is not a question: ZaraiLink serves Pakistan only.
        ...(located ? { country: COUNTRY, province: values.province, city: values.city, street: values.street } : {}),
        ...(role === 'farmer' ? { village: values.village } : {}),
      });
      // No session back means the OTP must be confirmed before sign-in; authStore's
      // onAuthStateChange picks up the session automatically once verifyOtp succeeds.
      if (!session) {
        navigation.navigate(AUTH_ROUTES.VerifyOtp, { purpose: 'signup', email });
      }
    } catch (error) {
      setSubmitError(mapPasswordFlowErrorMessage(error, 'Could not create the account. Try again.'));
    }
  };

  return (
    <AuthScreen title={TITLES[role]} onBack={navigation.goBack}>
      <Button
        label="Choose a different account type"
        variant="quiet"
        fullWidth={false}
        onPress={() => navigation.navigate(AUTH_ROUTES.CreateAccount)}
        style={styles.change}
      />

      <View>
        <Controller
          control={control}
          name="fullName"
          render={({ field: { ref, onChange, onBlur, value } }) => (
            <TextField
              ref={ref}
              label="Full name"
              helper="Letters only, with one space between names"
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
              onSubmitEditing={() => setFocus('email')}
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
          render={({ field: { ref, onChange, onBlur, value } }) => (
            <TextField
              ref={ref}
              label="Email"
              helper="A 6-digit code is emailed here to confirm your account"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => setFocus('password')}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.email?.message}
            />
          )}
        />

        {/* Typed once, with Show, instead of twice: in sunlight a person sees what they typed, and a second field would
            only repeat the same slip. */}
        <Controller
          control={control}
          name="password"
          render={({ field: { ref, onChange, onBlur, value } }) => (
            <TextField
              ref={ref}
              label="Password"
              helper={PASSWORD_HELPER}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="done"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.password?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="phone"
          render={({ field: { onChange, value } }) => (
            <PhoneInput value={value || null} onChange={next => onChange(next ?? '')} error={errors.phone?.message} />
          )}
        />

        {located ? (
          <>
            <LocationPicker
              province={watch('province') || null}
              city={watch('city') || null}
              onProvinceChange={value => setValue('province', value ?? '', { shouldValidate: submitCount > 0 })}
              onCityChange={value => setValue('city', value ?? '', { shouldValidate: submitCount > 0 })}
              errors={{ province: errors.province?.message, city: errors.city?.message }}
            />
            {role === 'farmer' ? (
              <Controller
                control={control}
                name="village"
                render={({ field: { ref, onChange, onBlur, value } }) => (
                  <TextField
                    ref={ref}
                    label="Village"
                    returnKeyType="next"
                    onSubmitEditing={() => setFocus('street')}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.village?.message}
                  />
                )}
              />
            ) : null}
            <Controller
              control={control}
              name="street"
              render={({ field: { ref, onChange, onBlur, value } }) => (
                <TextField
                  ref={ref}
                  label="Address"
                  autoComplete="street-address"
                  textContentType="fullStreetAddress"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.street?.message}
                />
              )}
            />
          </>
        ) : null}
      </View>

      {reviewed ? (
        <Banner tone="info">
          {`After the email code you send your ${role === 'dealer' ? 'business' : 'professional'} details and documents. An administrator reviews them before the account can be used.`}
        </Banner>
      ) : null}

      <FormErrorSummary errors={errors} submitted={submitCount > 0} />
      {submitError ? <Banner tone="danger" title={submitError} /> : null}

      <Button label="Create account" size="lg" loading={isSubmitting} onPress={handleSubmit(onSubmit)} />

      <View style={styles.footer}>
        <Text style={styles.footerText}>Already have an account?</Text>
        <Button label="Log in" variant="quiet" fullWidth={false} onPress={() => navigation.navigate(AUTH_ROUTES.Login)} />
      </View>
    </AuthScreen>
  );
}

// Builds this screen's styles from the theme.
function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    change: { alignSelf: 'flex-start', marginTop: -space[4] },
    footer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: space[1] },
    footerText: { ...typography.body, color: colors.ink2 },
  });
}
