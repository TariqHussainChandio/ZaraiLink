import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  TouchableOpacityProps,
  ViewStyle,
} from 'react-native';
import { lightTheme } from '../../theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

export interface ButtonProps extends TouchableOpacityProps {
  label: string;
  variant?: ButtonVariant;
  loading?: boolean;
  fullWidth?: boolean;
}

const { colors, spacing, radii, typography } = lightTheme;

export function Button({
  label,
  variant = 'primary',
  loading = false,
  fullWidth = true,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      activeOpacity={0.75}
      disabled={isDisabled}
      style={[
        styles.base,
        variantStyles[variant].container,
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator
          color={
            variant === 'primary' || variant === 'destructive'
              ? colors.neutral.white
              : colors.brand.primary
          }
        />
      ) : (
        <Text style={[styles.label, variantStyles[variant].label]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold as TextStyle['fontWeight'],
  },
});

const variantStyles: Record<ButtonVariant, { container: ViewStyle; label: TextStyle }> = {
  primary: {
    container: { backgroundColor: colors.brand.primary },
    label: { color: colors.neutral.white },
  },
  secondary: {
    container: {
      backgroundColor: colors.neutral.white,
      borderWidth: 1,
      borderColor: colors.brand.primary,
    },
    label: { color: colors.brand.primary },
  },
  ghost: {
    container: { backgroundColor: 'transparent' },
    label: { color: colors.brand.primary },
  },
  destructive: {
    container: { backgroundColor: colors.semantic.error },
    label: { color: colors.neutral.white },
  },
};
