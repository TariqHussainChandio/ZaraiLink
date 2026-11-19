import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { z } from 'zod';
import { Banner, Button, TextField } from '../../components';
import { AUTH_ROUTES } from '../../constants/routes';
import { useResendSignupOtp, useSignIn } from '../hooks/auth';
import { AuthScreen } from '../components/AuthScreen';
import { useLoginNotice } from '../state/loginNotice';
import { useTheme, type Theme } from '../../../theme';
import { isEmailNotConfirmed, isSendRateLimited, mapPasswordFlowErrorMessage } from './mapAuthError';
import type { AuthScreenProps } from '../../../navigation/stacks/AuthNavigator';

// Sign-in checks only that a password was given: an account may predate today's rules, and Supabase decides.
const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginScreen({ navigation }: AuthScreenProps<'Login'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { mutateAsync: signIn } = useSignIn();
  const { mutateAsync: resendSignupOtp } = useResendSignupOtp();
  const [submitError, setSubmitError] = useState<string | null>(null);
  // The email whose account is waiting for its code (AU-01): sign-in is refused until it is entered.
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [sendingCode, setSendingCode] = useState(false);
  const notice = useLoginNotice(state => state.notice);
  const clearNotice = useLoginNotice(state => state.clear);
  const {
    control,
    handleSubmit,
    setFocus,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  // An approved dealer or expert signing in again arrives with their email already in the box.
  useEffect(() => {
    if (notice?.email) setValue('email', notice.email);
  }, [notice, setValue]);

  const onSubmit = async (values: LoginFormValues) => {
    setSubmitError(null);
    setUnconfirmedEmail(null);
    clearNotice();
    const email = values.email.trim();
    try {
      await signIn({ email, password: values.password });
    } catch (error) {
      if (isEmailNotConfirmed(error)) {
        setUnconfirmedEmail(email);
        return;
      }
      setSubmitError(mapPasswordFlowErrorMessage(error, 'Could not sign in. Try again.'));
    }
  };

  // The sign-up code may be long gone (the phone closed the app while the person fetched it from their mail), so a new one
  // is sent and the code screen opens. A send refused as too soon is fine: the code from a minute ago still works.
  const enterCode = async () => {
    if (!unconfirmedEmail || sendingCode) return;
    setSendingCode(true);
    setSubmitError(null);
    try {
      await resendSignupOtp(unconfirmedEmail);
    } catch (error) {
      if (!isSendRateLimited(error)) {
        setSubmitError(mapPasswordFlowErrorMessage(error, 'Could not send the code. Try again.'));
        setSendingCode(false);
        return;
      }
    }
    setSendingCode(false);
    navigation.navigate(AUTH_ROUTES.VerifyOtp, { purpose: 'signup', email: unconfirmedEmail });
  };

  return (
    <AuthScreen brand title="Sign in">
      {notice ? (
        <Banner tone={notice.tone} title={notice.title}>
          {notice.message}
        </Banner>
      ) : null}
      <View>
        <Controller
          control={control}
          name="email"
          render={({ field: { ref, onChange, onBlur, value } }) => (
            <TextField
              ref={ref}
              label="Email"
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
        <Controller
          control={control}
          name="password"
          render={({ field: { ref, onChange, onBlur, value } }) => (
            <TextField
              ref={ref}
              label="Password"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={handleSubmit(onSubmit)}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.password?.message}
            />
          )}
        />
      </View>

      {unconfirmedEmail ? (
        <Banner
          tone="info"
          title="Confirm your email first"
          actionLabel="Enter your code"
          onAction={enterCode}
        >
          {`Enter the code we emailed to ${unconfirmedEmail}.`}
        </Banner>
      ) : null}
      {submitError ? <Banner tone="danger" title={submitError} /> : null}

      <Button label="Sign in" size="lg" loading={isSubmitting} onPress={handleSubmit(onSubmit)} />

      <View style={styles.links}>
        <Button label="Forgot password?" variant="quiet" fullWidth={false} onPress={() => navigation.navigate(AUTH_ROUTES.ForgotPassword)} />
        <Button label="Create account" variant="quiet" fullWidth={false} onPress={() => navigation.navigate(AUTH_ROUTES.CreateAccount)} />
      </View>
    </AuthScreen>
  );
}

function makeStyles({ space }: Theme) {
  return StyleSheet.create({
    links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: space[2] },
  });
}
