import React, { useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  TouchableOpacityProps,
  ViewStyle,
} from 'react-native';
import { useTheme, type Theme } from '../../theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

export interface ButtonProps extends TouchableOpacityProps {
  label: string;
  variant?: ButtonVariant;
  loading?: boolean;
  fullWidth?: boolean;
}

// Scale-down-on-press, on top of the existing opacity feedback — a button should feel pressed,
// not just dimmed. 0.97 (not smaller) so it reads as tactile rather than jumpy.
const PRESSED_SCALE = 0.97;

export function Button({
  label,
  variant = 'primary',
  loading = false,
  fullWidth = true,
  disabled,
  style,
  onPressIn,
  onPressOut,
  ...rest
}: ButtonProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const variantStyle = useMemo(() => variantStyles(theme)[variant], [theme, variant]);
  const isDisabled = disabled || loading;
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (toValue: number) =>
    Animated.timing(scale, {
      toValue,
      duration: theme.motion.duration.instant,
      easing: theme.motion.easing.standard,
      useNativeDriver: true,
    }).start();

  return (
    <Animated.View style={[fullWidth && styles.fullWidth, { transform: [{ scale }] }, style]}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled }}
        activeOpacity={0.75}
        disabled={isDisabled}
        onPressIn={e => {
          animateTo(PRESSED_SCALE);
          onPressIn?.(e);
        }}
        onPressOut={e => {
          animateTo(1);
          onPressOut?.(e);
        }}
        style={[styles.base, variantStyle.container, isDisabled && styles.disabled]}
        {...rest}
      >
        {loading ? (
          <ActivityIndicator
            color={
              variant === 'primary' || variant === 'destructive'
                ? theme.colors.neutral.white
                : theme.colors.brand.primary
            }
          />
        ) : (
          <Text style={[styles.label, variantStyle.label]}>{label}</Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

function makeStyles({ spacing, radii, typography }: Theme) {
  return StyleSheet.create({
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
}

function variantStyles({ colors }: Theme): Record<ButtonVariant, { container: ViewStyle; label: TextStyle }> {
  return {
    primary: {
      container: { backgroundColor: colors.brand.primary },
      label: { color: colors.neutral.white },
    },
    secondary: {
      container: {
        backgroundColor: colors.background.surface,
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
}
