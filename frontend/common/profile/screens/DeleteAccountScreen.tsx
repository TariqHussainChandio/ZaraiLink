import { zodResolver } from '@hookform/resolvers/zod';
import React, { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, Text } from 'react-native';
import { z } from 'zod';
import { Button, ConfirmSheet, ScreenScaffold, TextField } from '../../components';
import { useLoginNotice } from '../../auth';
import { useDeleteOwnAccount } from '../hooks/profile';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';
import { isApiError } from '../../../services/api/errors';

const deleteAccountSchema = z.object({ password: z.string().min(1, 'Enter your password to confirm') });

type DeleteAccountFormValues = z.infer<typeof deleteAccountSchema>;

// P4 (4A.5). No navigation prop used — on success, signOut() flips authStore's status to
// 'unauthenticated' and RootNavigator swaps to the auth flow on its own, the same way every
// other sign-out in this app already works.
export function DeleteAccountScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { mutateAsync: deleteOwnAccount } = useDeleteOwnAccount();
  const signOut = useAuthStore(state => state.signOut);
  const leaveNotice = useLoginNotice(state => state.leave);
  // The password is checked by the server when the deletion is confirmed; it is held here only for that one request.
  const [confirming, setConfirming] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<DeleteAccountFormValues>({
    resolver: zodResolver(deleteAccountSchema),
    defaultValues: { password: '' },
  });

  const deleteNow = async () => {
    if (confirming === null) return;
    try {
      await deleteOwnAccount(confirming);
    } catch (error) {
      if (isApiError(error) && error.code === 'incorrect_password') {
        // The wrong password belongs on the password field, not in a banner: close the sheet and say it there.
        setConfirming(null);
        setError('password', { message: 'That password is not correct.' });
        return;
      }
      // Anything else stays in the sheet, with the reason, so the person can try again without retyping.
      throw error;
    }
    // Signing out swaps the whole navigator, so the sign-in screen is told what happened through this notice.
    leaveNotice({ tone: 'success', title: 'Account deleted', message: 'Your account and your personal details were removed.' });
    await signOut();
  };

  return (
    <ScreenScaffold>
      <Text style={styles.warning}>
        This permanently deletes your account. Your name, phone number and photo are removed everywhere they appear, and you
        cannot sign in again.
      </Text>

      <Controller
        control={control}
        name="password"
        render={({ field: { ref, onChange, onBlur, value } }) => (
          <TextField
            ref={ref}
            label="Your password"
            helper="Enter it to confirm that this is you"
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={handleSubmit(values => setConfirming(values.password))}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.password?.message}
          />
        )}
      />

      <Button
        label="Delete my account"
        variant="danger"
        size="lg"
        onPress={handleSubmit(values => setConfirming(values.password))}
      />

      <ConfirmSheet
        visible={confirming !== null}
        onClose={() => setConfirming(null)}
        title="Delete your account?"
        message="This cannot be undone. Your account and your personal details are removed for good."
        confirmLabel="Delete account"
        keepLabel="Keep my account"
        destructive
        onConfirm={deleteNow}
      />
    </ScreenScaffold>
  );
}

function makeStyles({ colors, typography }: Theme) {
  return StyleSheet.create({
    warning: { ...typography.body, color: colors.status.danger.ink },
  });
}
