import { zodResolver } from '@hookform/resolvers/zod';
import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Banner, Button, TextField } from '../../components';
import { AUTH_ROUTES } from '../../constants/routes';
import { useResetPassword } from '../hooks/auth';
import { AuthScreen } from '../components/AuthScreen';
import { mapPasswordFlowErrorMessage } from './mapAuthError';
import type { AuthScreenProps } from '../../../navigation/stacks/AuthNavigator';

// Trimmed first: a space after a pasted address is the commonest reason an email "is not valid".
const forgotPasswordSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email').email('Enter a valid email'),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export function ForgotPasswordScreen({ navigation }: AuthScreenProps<'ForgotPassword'>) {
  const { mutateAsync: resetPassword } = useResetPassword();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  // P4 (4B.4): a numeric code (VerifyOtpScreen), not a link — resetPassword() no longer takes a
  // redirectTo, so there's nothing to wait for here; move straight to entering the code.
  const onSubmit = async (values: ForgotPasswordFormValues) => {
    setSubmitError(null);
    const email = values.email.trim();
    try {
      await resetPassword(email);
      navigation.navigate(AUTH_ROUTES.VerifyOtp, { purpose: 'recovery', email });
    } catch (error) {
      setSubmitError(mapPasswordFlowErrorMessage(error, 'Could not send the code. Try again.'));
    }
  };

  return (
    <AuthScreen title="Reset your password" subtitle="Enter your account email. If it has an account, a reset code is sent to it.">
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
            returnKeyType="go"
            onSubmitEditing={handleSubmit(onSubmit)}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.email?.message}
          />
        )}
      />

      {submitError ? <Banner tone="danger" title={submitError} /> : null}

      <Button label="Send code" size="lg" loading={isSubmitting} onPress={handleSubmit(onSubmit)} />
      <Button label="Back to sign in" variant="quiet" fullWidth={false} onPress={() => navigation.goBack()} />
    </AuthScreen>
  );
}
