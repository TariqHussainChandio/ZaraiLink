import { zodResolver } from '@hookform/resolvers/zod';
import { Trash2, X } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';
import { Banner, Button, Sheet, TextField } from '../../components';
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

  // The password waits here while the confirmation sheet is open; it is the last check before the account goes.
  const [confirmPassword, setConfirmPassword] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const onSubmit = (values: DeleteAccountFormValues) => {
    setSubmitError(null);
    setConfirmPassword(values.password);
  };

  const confirmDelete = async () => {
    if (confirmPassword === null) return;
    setDeleting(true);
    try {
      await deleteOwnAccount(confirmPassword);
      await signOut();
    } catch (error) {
      setConfirmPassword(null);
      setSubmitError(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Delete account</Text>
      <Text style={styles.warning}>This permanently deactivates your account. Your name, phone number, and photo are removed everywhere they appear. You will not be able to sign in again.</Text>

      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Confirm your password"
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
        label="Delete my account"
        icon={Trash2}
        variant="danger"
        loading={isSubmitting}
        onPress={handleSubmit(onSubmit)}
        style={styles.submit}
      />

      <Sheet
        visible={confirmPassword !== null}
        onClose={() => (deleting ? undefined : setConfirmPassword(null))}
        title="Delete your account?"
      >
        <Text style={styles.sheetText}>This cannot be undone. Your account is deleted for good.</Text>
        <View style={styles.sheetActions}>
          <Button label="Delete" icon={Trash2} variant="danger" loading={deleting} onPress={confirmDelete} />
          <Button
            label="Cancel"
            icon={X}
            variant="secondary"
            disabled={deleting}
            onPress={() => setConfirmPassword(null)}
          />
        </View>
      </Sheet>
    </View>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
      padding: space[4],
    },
    title: {
      ...typography.titleLg,
      color: colors.ink,
      marginBottom: space[2],
    },
    warning: {
      ...typography.body,
      color: colors.status.danger.mark,
      marginBottom: space[6],
    },
    errorBanner: {
      marginBottom: space[3],
    },
    submit: {
      marginTop: space[2],
    },
    sheetText: {
      ...typography.body,
      color: colors.ink2,
      marginBottom: space[4],
    },
    sheetActions: {
      gap: space[2],
    },
  });
}
