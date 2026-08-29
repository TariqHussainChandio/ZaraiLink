import React, { forwardRef } from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { lightTheme } from '../../theme';

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

const { colors, spacing, radii, typography } = lightTheme;

export const Input = forwardRef<TextInput, InputProps>(
  ({ label, error, style, ...rest }, ref) => {
    return (
      <View style={styles.container}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.neutral.gray400}
          style={[styles.input, error && styles.inputError, style]}
          {...rest}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    );
  },
);

Input.displayName = 'Input';

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium as any,
    color: colors.neutral.gray700,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.neutral.gray300,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: typography.sizes.base,
    color: colors.neutral.gray900,
    backgroundColor: colors.neutral.white,
  },
  inputError: {
    borderColor: colors.semantic.error,
  },
  error: {
    marginTop: spacing.xs,
    fontSize: typography.sizes.xs,
    color: colors.semantic.error,
  },
});
