import { Check, type LucideIcon } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { type Accent, type Theme, useRoleAccent, useTheme } from '../../theme';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: LucideIcon;
  /** A count shown after the label, in the board face. */
  count?: number;
  disabled?: boolean;
}

/** Filters a list or picks one option. Selected takes the scope's tint, a 2px accent border and a check, so selection
 * is shown by shape as well as colour. 40 dp tall with hitSlop to 48. */
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
      android_ripple={{ color: theme.colors.ripple }}
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
  /** A count shown after the label. */
  count?: number;
}

export interface ChipRowProps<T extends string> {
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Wrap onto a second line so every option stays visible (a form). Off, the row scrolls sideways, which suits a filter
   * above a list. */
  wrap?: boolean;
}

/** A row of single-choice chips, such as the status filter above a list. */
export function ChipRow<T extends string>({ options, value, onChange, wrap = false }: ChipRowProps<T>) {
  const theme = useTheme();
  const styles = useMemo(() => makeRowStyles(theme), [theme]);
  const chips = options.map(option => (
    <Chip key={option.value} label={option.label} count={option.count} selected={option.value === value} onPress={() => onChange(option.value)} />
  ));
  if (wrap) return <View style={styles.wrap}>{chips}</View>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row} contentContainerStyle={styles.content}>
      {chips}
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
      // The ripple is clipped to the chip's corners.
      overflow: 'hidden',
    },
    // The thicker border takes the width it adds from the padding, so choosing a chip never shifts its neighbours.
    selected: {
      backgroundColor: accent.soft,
      borderColor: accent.mark,
      borderWidth: borders.selected,
      paddingHorizontal: chip.paddingX - (borders.selected - borders.control),
    },
    disabled: { borderColor: colors.line },
    label: { ...typography.label },
    count: { ...typography.figure, color: colors.ink3 },
  });
}

function makeRowStyles({ space }: Theme) {
  return StyleSheet.create({
    row: { flexGrow: 0, marginBottom: space[3] },
    content: { gap: space[2] },
    wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginBottom: space[3] },
  });
}
