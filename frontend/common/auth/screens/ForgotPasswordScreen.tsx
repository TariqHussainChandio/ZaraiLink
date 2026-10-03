import { zodResolver } from '@hookform/resolvers/zod';
import React, { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';
import { Banner, Button, TextField } from '../../components';
import { AUTH_ROUTES } from '../../constants/routes';
import { useResetPassword } from '../hooks/auth';
import { useTheme, type Theme } from '../../../theme';
import { mapPasswordFlowErrorMessage } from './mapAuthError';
import type { AuthScreenProps } from '../../../navigation/stacks/AuthNavigator';

function makeForgotPasswordSchema() {
  return z.object({
    email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  });
}

type ForgotPasswordFormValues = z.infer<ReturnType<typeof makeForgotPasswordSchema>>;

export function ForgotPasswordScreen({ navigation }: AuthScreenProps<'ForgotPassword'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { mutateAsync: resetPassword } = useResetPassword();
  const forgotPasswordSchema = useMemo(() => makeForgotPasswordSchema(), []);
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
    try {
      await resetPassword(values.email);
      navigation.navigate(AUTH_ROUTES.VerifyOtp, { purpose: 'recovery', identifier: values.email });
    } catch (error) {
      setSubmitError(mapPasswordFlowErrorMessage(error, 'Failed to send reset email'));
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Reset your password</Text>
      <Text style={styles.subtitle}>{"Enter your account email and we'll send you a reset code."}</Text>

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

      {submitError ? (

        <View style={styles.errorBanner}>

          <Banner tone="danger" title={submitError} />

        </View>

      ) : null}

      <Button
        label="Send code"
        loading={isSubmitting}
        onPress={handleSubmit(onSubmit)}
        style={styles.submit}
      />

      <View style={styles.links}>
        <Button label="Back to sign in" variant="quiet" fullWidth={false} onPress={() => navigation.goBack()} />
      </View>
    </View>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    links: {
      alignItems: 'center',
      marginTop: space[4],
      gap: space[2],
    },
    container: {
      flex: 1,
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
  });
}
