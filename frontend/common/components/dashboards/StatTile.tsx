import type { LucideIcon } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type Theme, type ToneKey, useRoleAccent, useTheme } from '../../../theme';

export interface StatTileProps {
  label: string;
  /** Already formatted: "3,482", "Rs 2,184,300". `null` or `undefined` means the figure could not be loaded: the tile
   * shows "—", never 0, because a zero is a claim ("nothing is waiting") the app cannot make. */
  value: string | number | null | undefined;
  unit?: string;
  note?: string;
  icon?: LucideIcon;
  /** The module colour this number belongs to (theme.colors.module.*); defaults to the shell's accent. */
  accent?: string;
  /** How this number stands: its mark and figure take the tone ("3 orders late" in warning). Overrides `accent`. */
  tone?: ToneKey;
  /** Makes the tile one button that opens where the number comes from. */
  onPress?: () => void;
}

const UNKNOWN = '—';

/** One number that matters on a dashboard, with its unit and a plain note. Two to a row on phones. */
export function StatTile({ label, value, unit, note, icon: Icon, accent, tone, onPress }: StatTileProps) {
  const theme = useTheme();
  const role = useRoleAccent();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const toned = tone ? theme.colors.status[tone] : undefined;
  const mark = toned?.mark ?? accent ?? role.mark;
  const known = value !== null && value !== undefined;
  const shown = !known ? UNKNOWN : typeof value === 'number' ? value.toLocaleString('en-PK') : value;
  // The dash is read as words: "Orders to dispatch: not available".
  const spoken = `${label}: ${known ? `${shown}${unit ? ` ${unit}` : ''}` : 'not available'}${note ? `, ${note}` : ''}`;

  const body = (
    <>
      <View style={styles.head}>
        {Icon ? <Icon color={mark} size={theme.size.iconSm} /> : <View testID="stat-tile-accent" style={[styles.dot, { backgroundColor: mark }]} />}
        <Text style={styles.label}>{label}</Text>
      </View>
      <View style={styles.valueRow}>
        {/* A figure never breaks across lines: in a narrow tile it shrinks to fit instead. */}
        <Text style={[styles.value, toned && { color: toned.ink }]} numberOfLines={1} adjustsFontSizeToFit>
          {shown}
        </Text>
        {known && unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </>
  );

  if (!onPress) {
    return (
      <View style={styles.tile} accessible accessibilityLabel={spoken}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      style={[styles.tile, styles.pressable]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      android_ripple={{ color: theme.colors.ripple }}
    >
      {body}
    </Pressable>
  );
}

function makeStyles({ colors, space, size, radius, borders, components, typography }: Theme) {
  return StyleSheet.create({
    // Two across: a tile grows from a basis over a third of the row, so a third or fourth tile in a wrapping row moves to
    // the next line instead of squeezing four across, where Android broke labels mid-word ("Farm-er").
    tile: {
      flexGrow: 1,
      flexBasis: '40%',
      gap: space[1],
      padding: components.card.padding,
      backgroundColor: colors.surface,
      borderRadius: components.card.radius,
      borderWidth: borders.hairline,
      borderColor: colors.line,
      minWidth: 0,
    },
    pressable: { overflow: 'hidden' },
    head: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    dot: { width: size.dot, height: size.dot, borderRadius: radius.pill },
    label: { ...typography.caption, flex: 1, color: colors.ink2 },
    valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: space[1], flexWrap: 'wrap' },
    value: { ...typography.figureLg, color: colors.ink },
    unit: { ...typography.caption, color: colors.ink2 },
    note: { ...typography.caption, color: colors.ink3 },
  });
}
