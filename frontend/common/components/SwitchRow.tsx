import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { type Theme, useRoleAccent, useTheme } from '../../theme';

export interface SwitchRowProps {
  label: string;
  /** A line under the label: what the setting does. Also spoken, after the label. */
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

/**
 * A setting that is on or off: the label, an optional description and a Switch, where the whole row is the target.
 *
 * The bare Android Switch is 46 x 27 dp, under the 48 dp minimum (A8 accessibility run), so the row is the control: a tap
 * anywhere on it flips the value, and TalkBack reads it once as a switch with its name and state. The Switch inside only
 * draws the state.
 */
export function SwitchRow({ label, description, value, onValueChange, disabled = false }: SwitchRowProps) {
  const theme = useTheme();
  const accent = useRoleAccent();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const toggle = () => onValueChange(!value);

  return (
    <Pressable
      onPress={toggle}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ checked: value, disabled }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.text}>
        <Text style={[styles.label, disabled && styles.disabled]}>{label}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      <Switch
        // The row carries the name, the role and the state; the Switch is not a second stop.
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: accent.mark, false: theme.colors.lineStrong }}
      />
    </Pressable>
  );
}

function makeStyles({ colors, space, size, typography }: Theme) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      minHeight: size.touchMin,
      paddingVertical: space[2],
    },
    pressed: { opacity: 0.6 },
    text: { flex: 1, minWidth: 0 },
    label: { ...typography.body, color: colors.ink },
    disabled: { color: colors.inkDisabled },
    description: { ...typography.caption, color: colors.ink2 },
  });
}
