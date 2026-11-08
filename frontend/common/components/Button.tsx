import type { LucideIcon } from 'lucide-react-native';
import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { type Accent, type Theme, useRoleAccent, useTheme } from '../../theme';

/** primary: the one main action on a screen; secondary: an alternative; quiet: low emphasis; danger: destructive (it
 * always opens a confirm sheet first); dangerQuiet: a text-only destructive entry point ("Cancel this order") that opens
 * the confirm sheet from inside the content. */
type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger' | 'dangerQuiet';
/** lg (56) for sticky bars and form ends, md (48) inside cards, rows and banners, sm (40) in dense admin and inventory rows. */
type ButtonSize = 'lg' | 'md' | 'sm';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  /** Starts with a verb that names the result: "Place order", "Talk to an expert". */
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  /** Keeps the label and adds a spinner beside it (in place of the icon), so a full-width bar does not jump. */
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
  ...rest
}: ButtonProps) {
  const theme = useTheme();
  const accent = useRoleAccent();
  const styles = useMemo(() => makeStyles(theme, accent), [theme, accent]);
  const isDisabled = disabled || loading;
  const { button } = theme.components;
  const height = button.height[size];
  const filled = variant === 'primary' || variant === 'danger';
  const tone = isDisabled ? styles.disabled : styles[variant];
  const labelColor = isDisabled ? theme.colors.inkDisabled : foreground(theme, accent, variant);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      hitSlop={theme.components.hitSlop(height)}
      // Press shows the Android ripple and never scales or moves anything (D15, "Motion answers a hand").
      android_ripple={{ color: filled ? theme.colors.rippleOnFill : theme.colors.ripple }}
      style={[styles.base, fullWidth && styles.fullWidth, { minHeight: height, paddingHorizontal: button.paddingX[size] }, tone, style]}
      {...rest}
    >
      <View style={styles.content}>
        {loading ? (
          // Decorative: the button's own "busy" state is what a screen reader announces.
          <ActivityIndicator color={labelColor} size="small" importantForAccessibility="no" />
        ) : Icon ? (
          <Icon color={labelColor} size={theme.size.iconButton} />
        ) : null}
        <Text style={[size === 'sm' ? styles.labelSm : styles.label, { color: labelColor }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

function foreground({ colors }: Theme, accent: Accent, variant: ButtonVariant): string {
  if (variant === 'primary' || variant === 'danger') return colors.onAccent;
  if (variant === 'dangerQuiet') return colors.status.danger.ink;
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
      // The ripple is clipped to the rounded corners.
      overflow: 'hidden',
    },
    content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: components.button.gap },
    primary: { backgroundColor: accent.fill },
    secondary: { backgroundColor: colors.surface, borderColor: colors.lineStrong },
    quiet: { backgroundColor: 'transparent' },
    danger: { backgroundColor: colors.status.danger.fill },
    dangerQuiet: { backgroundColor: 'transparent' },
    disabled: { backgroundColor: colors.surfaceSunken },
    label: { ...typography.label, textAlign: 'center', flexShrink: 1 },
    labelSm: { ...typography.caption, fontWeight: fontWeight.semibold, textAlign: 'center', flexShrink: 1 },
  });
}
