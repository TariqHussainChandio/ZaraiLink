import { Check, type LucideIcon } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { type Accent, type Theme, useRoleAccent, useTheme } from '../../theme';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: LucideIcon;
  /** A count shown after the label, in the mono face. */
  count?: number;
  disabled?: boolean;
}

/** Filters a list or picks one option. Selected takes the scope's tint, its accent border and a check, so selection is
 * shown by shape as well as colour. */
export function Chip({ label, selected = false, onPress, icon: Icon, count, disabled }: ChipProps) {
  const theme = useTheme();
  const accent = useRoleAccent();
  const styles = useMemo(() => makeStyles(theme, accent), [theme, accent]);
  const fg = disabled ? theme.colors.inkDisabled : selected ? accent.ink : theme.colors.ink;
  const Lead = selected ? Check : Icon;

  return (
    <Pressable
      style={[styles.chip, selected && styles.selected, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      hitSlop={theme.components.hitSlop(theme.size.chip)}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
    >
      {Lead ? <Lead color={fg} size={theme.size.iconSm} /> : null}
      <Text style={[styles.label, { color: fg }]}>{label}</Text>
      {count != null ? <Text style={[styles.count, selected && { color: accent.ink }]}>{count}</Text> : null}
    </Pressable>
  );
}

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

export interface ChipRowProps<T extends string> {
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** One scrolling row of single-choice chips, such as the status filter above a list. */
export function ChipRow<T extends string>({ options, value, onChange }: ChipRowProps<T>) {
  const theme = useTheme();
  const styles = useMemo(() => makeRowStyles(theme), [theme]);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row} contentContainerStyle={styles.content}>
      {options.map(option => (
        <Chip key={option.value} label={option.label} selected={option.value === value} onPress={() => onChange(option.value)} />
      ))}
    </ScrollView>
  );
}

function makeStyles({ colors, borders, components, typography }: Theme, accent: Accent) {
  const { chip } = components;
  return StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: chip.gap,
      minHeight: chip.height,
      paddingHorizontal: chip.paddingX,
      borderRadius: chip.radius,
      borderWidth: borders.control,
      borderColor: colors.lineStrong,
      backgroundColor: colors.surface,
    },
    selected: { backgroundColor: accent.soft, borderColor: accent.mark },
    disabled: { borderColor: colors.line },
    label: { ...typography.label },
    count: { ...typography.figure, color: colors.ink3 },
  });
}

function makeRowStyles({ space }: Theme) {
  return StyleSheet.create({
    row: { flexGrow: 0, marginBottom: space[3] },
    content: { gap: space[2] },
  });
}
