import { zodResolver } from '@hookform/resolvers/zod';
import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Banner, Button, TextField } from '../../components';
import { useUpdatePassword } from '../../profile';
import { newPasswordSchema, PASSWORD_HELPER } from '../../validation/password';
import { useAuthStore } from '../../../state/authStore';
import { AuthScreen } from '../components/AuthScreen';
import { mapPasswordFlowErrorMessage } from './mapAuthError';

// Typed once, with Show: a second field would repeat nothing the person cannot already see.
const resetPasswordSchema = z.object({ password: newPasswordSchema });

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

// Rendered directly by RootNavigator when authStore's status is 'passwordRecovery' (the reset code was just entered and
// exchanged for a session): no navigation props and no route params, unlike ChangePasswordScreen, its signed-in
// counterpart. On success, `updatePassword` triggers a USER_UPDATED auth event that authStore's existing applySession
// path picks up, flipping status to 'authenticated'; RootNavigator then swaps to the app shell with nothing more to do
// here.
export function ResetPasswordScreen() {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const updatePassword = useUpdatePassword();
  // The recovery session is a real session and this screen has nothing behind it, so Cancel ends the session.
  const signOut = useAuthStore(state => state.signOut);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '' },
  });

  const onSubmit = async (values: ResetPasswordFormValues) => {
    setSubmitError(null);
    try {
      await updatePassword.mutateAsync(values.password);
    } catch (error) {
      setSubmitError(mapPasswordFlowErrorMessage(error, 'Could not update the password. Try again.'));
    }
  };

  return (
    <AuthScreen title="Set a new password" subtitle="Choose a new password for your ZaraiLink account.">
      <Controller
        control={control}
        name="password"
        render={({ field: { ref, onChange, onBlur, value } }) => (
          <TextField
            ref={ref}
            label="New password"
            helper={PASSWORD_HELPER}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={handleSubmit(onSubmit)}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.password?.message}
          />
        )}
      />

      {submitError ? <Banner tone="danger" title={submitError} /> : null}

      <Button label="Update password" size="lg" loading={isSubmitting} onPress={handleSubmit(onSubmit)} />
      <Button label="Cancel" variant="quiet" fullWidth={false} onPress={signOut} />
    </AuthScreen>
  );
}
