import type { LucideIcon } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { type Theme, useRoleAccent, useTheme } from '../../../theme';

export interface StatTileProps {
  label: string;
  /** Already formatted: "3,482", "Rs 2,184,300". */
  value: string | number;
  unit?: string;
  note?: string;
  icon?: LucideIcon;
  /** The module colour this number belongs to (theme.colors.module.*); defaults to the shell's accent. */
  accent?: string;
}

/** One number that matters on a dashboard, with its unit and a plain note. Two to a row on phones. */
export function StatTile({ label, value, unit, note, icon: Icon, accent }: StatTileProps) {
  const theme = useTheme();
  const role = useRoleAccent();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const mark = accent ?? role.mark;

  return (
    <View style={styles.tile} accessibilityLabel={`${label}: ${value}${unit ? ` ${unit}` : ''}`}>
      <View style={styles.head}>
        {Icon ? <Icon color={mark} size={theme.size.iconSm} /> : <View testID="stat-tile-accent" style={[styles.dot, { backgroundColor: mark }]} />}
        <Text style={styles.label}>{label}</Text>
      </View>
      <View style={styles.valueRow}>
        {/* A figure never breaks across lines: in a narrow tile it shrinks to fit instead. */}
        <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
          {typeof value === 'number' ? value.toLocaleString('en-PK') : value}
        </Text>
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
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
    head: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    dot: { width: size.dot, height: size.dot, borderRadius: radius.pill },
    label: { ...typography.caption, flex: 1, color: colors.ink2 },
    valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: space[1], flexWrap: 'wrap' },
    value: { ...typography.figureLg, color: colors.ink },
    unit: { ...typography.caption, color: colors.ink2 },
    note: { ...typography.caption, color: colors.ink3 },
  });
}
