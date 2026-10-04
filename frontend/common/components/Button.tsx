import type { LucideIcon } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { type Accent, type Theme, useRoleAccent, useTheme } from '../../theme';

/** primary: the one main action on a screen; secondary: an alternative; quiet: low emphasis; danger: destructive. */
type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';
/** lg (52) for sticky bars and form ends, md (44) inside cards, sm (36) in dense admin and inventory rows. */
type ButtonSize = 'lg' | 'md' | 'sm';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  /** Starts with a verb that names the result: "Place order", "Talk to an expert". */
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  loading?: boolean;
  /** Stretch to the container's width (default). */
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  loading = false,
  fullWidth = true,
  disabled,
  style,
  onPressIn,
  onPressOut,
  ...rest
}: ButtonProps) {
  const theme = useTheme();
  const accent = useRoleAccent();
  const styles = useMemo(() => makeStyles(theme, accent), [theme, accent]);
  const isDisabled = disabled || loading;
  const [scale] = useState(() => new Animated.Value(1));
  const { button } = theme.components;
  const height = button.height[size];
  const tone = isDisabled ? styles.disabled : styles[variant];
  const labelColor = isDisabled ? theme.colors.inkDisabled : foreground(theme, accent, variant);

  const animateTo = (toValue: number) =>
    Animated.timing(scale, {
      toValue,
      duration: theme.motion.duration.instant,
      easing: theme.motion.easing.standard,
      useNativeDriver: true,
    }).start();

  return (
    <Animated.View style={[fullWidth && styles.fullWidth, { transform: [{ scale }] }, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        disabled={isDisabled}
        hitSlop={theme.components.hitSlop(height)}
        onPressIn={e => {
          animateTo(button.pressedScale);
          onPressIn?.(e);
        }}
        onPressOut={e => {
          animateTo(1);
          onPressOut?.(e);
        }}
        style={[styles.base, { minHeight: height, paddingHorizontal: button.paddingX[size] }, tone]}
        {...rest}
      >
        {loading ? (
          <ActivityIndicator color={labelColor} />
        ) : (
          <View style={styles.content}>
            {Icon ? <Icon color={labelColor} size={theme.size.iconButton} /> : null}
            <Text style={[size === 'sm' ? styles.labelSm : styles.label, { color: labelColor }]}>{label}</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

function foreground({ colors }: Theme, accent: Accent, variant: ButtonVariant): string {
  if (variant === 'primary' || variant === 'danger') return colors.onAccent;
  return accent.ink;
}

function makeStyles({ colors, components, borders, typography, fontWeight }: Theme, accent: Accent) {
  return StyleSheet.create({
    fullWidth: { alignSelf: 'stretch' },
    base: {
      borderRadius: components.button.radius,
      borderWidth: borders.control,
      borderColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: { flexDirection: 'row', alignItems: 'center', gap: components.button.gap },
    primary: { backgroundColor: accent.fill },
    secondary: { backgroundColor: colors.surface, borderColor: colors.lineStrong },
    quiet: { backgroundColor: 'transparent' },
    danger: { backgroundColor: colors.status.danger.fill },
    disabled: { backgroundColor: colors.surfaceSunken },
    label: { ...typography.label, textAlign: 'center' },
    labelSm: { ...typography.caption, fontWeight: fontWeight.semibold, textAlign: 'center' },
  });
}
