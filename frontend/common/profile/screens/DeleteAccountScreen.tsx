import { zodResolver } from '@hookform/resolvers/zod';
import React, { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';
import { Button, Input } from '../../components';
import { useDeleteOwnAccount } from '../hooks/profile';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';
import { errorMessage } from '../../../utils/errorMessage';

function makeDeleteAccountSchema() {
  return z.object({ password: z.string().min(1, 'Enter your password to confirm') });
}

type DeleteAccountFormValues = z.infer<ReturnType<typeof makeDeleteAccountSchema>>;

// P4 (4A.5). No navigation prop used — on success, signOut() flips authStore's status to
// 'unauthenticated' and RootNavigator swaps to the auth flow on its own, the same way every
// other sign-out in this app already works.
export function DeleteAccountScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { mutateAsync: deleteOwnAccount } = useDeleteOwnAccount();
  const deleteAccountSchema = useMemo(() => makeDeleteAccountSchema(), []);
  const signOut = useAuthStore(state => state.signOut);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DeleteAccountFormValues>({
    resolver: zodResolver(deleteAccountSchema),
    defaultValues: { password: '' },
  });

  const onSubmit = async (values: DeleteAccountFormValues) => {
    setSubmitError(null);
    Alert.alert(
      'Delete your account?',
      'This cannot be undone. Are you sure you want to permanently delete your account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteOwnAccount(values.password);
              await signOut();
            } catch (error) {
              setSubmitError(errorMessage(error));
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Delete account</Text>
      <Text style={styles.warning}>This permanently deactivates your account. Your name, phone number, and photo are removed everywhere they appear. You will not be able to sign in again.</Text>

      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            label="Confirm your password"
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
        label="Delete my account"
        variant="destructive"
        loading={isSubmitting}
        onPress={handleSubmit(onSubmit)}
        style={styles.submit}
      />
    </View>
  );
}

function makeStyles({ colors, spacing, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.surface,
      padding: spacing.lg,
    },
    title: {
      fontSize: typography.sizes.xl,
      fontWeight: typography.weights.bold,
      color: colors.text.primary,
      marginBottom: spacing.sm,
    },
    warning: {
      fontSize: typography.sizes.base,
      color: colors.semantic.error,
      marginBottom: spacing.xl,
    },
    errorBanner: {
      color: colors.semantic.error,
      marginBottom: spacing.md,
    },
    submit: {
      marginTop: spacing.sm,
    },
  });
}
