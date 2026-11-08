import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { type Theme, useRoleAccent, useTheme } from '../../../theme';
import { EmptyState } from '../EmptyState';

export interface BarChartDatum {
  label: string;
  value: number;
}

export interface BarChartProps {
  data: BarChartDatum[];
  /** The bars' colour; defaults to the shell's accent mark. */
  color?: string;
  /** Height of the bar area only, in px: the value above and the label below sit outside it, so they never overlap a bar
   * however large the phone's font is set. */
  height?: number;
  formatValue?: (value: number) => string;
  emptyMessage?: string;
  /** What a screen reader says for the whole chart; by default a summary of every bar: "Aug 12, Sep 18, Oct 9". */
  accessibilityLabel?: string;
}

export function BarChart({ data, color, height, formatValue, emptyMessage = 'No data yet', accessibilityLabel }: BarChartProps) {
  const theme = useTheme();
  const accent = useRoleAccent();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  if (data.length === 0) {
    return <EmptyState title={emptyMessage} />;
  }

  const barArea = height ?? theme.size.chartBars;
  const max = Math.max(1, ...data.map(d => d.value));
  const show = (value: number) => (formatValue ? formatValue(value) : String(value));
  const summary = accessibilityLabel ?? data.map(d => `${d.label} ${show(d.value)}`).join(', ');

  return (
    // The chart is one picture to a screen reader: one stop with the numbers in it, not a dozen loose labels.
    <View style={styles.row} accessible accessibilityRole="image" accessibilityLabel={summary}>
      {data.map(d => (
        <View key={d.label} style={styles.column}>
          <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {show(d.value)}
          </Text>
          <View style={[styles.track, { height: barArea }]}>
            <View
              testID={`bar-${d.label}`}
              style={[
                styles.bar,
                {
                  // A value of zero still draws a stub, so an empty month reads as a month, not a gap.
                  height: Math.max(theme.borders.band, (d.value / max) * barArea),
                  backgroundColor: color ?? accent.mark,
                },
              ]}
            />
          </View>
          <Text style={styles.label} numberOfLines={1}>
            {d.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function makeStyles({ colors, space, radius, typography, fontWeight }: Theme) {
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'flex-end', gap: space[2] },
    column: { flex: 1, alignItems: 'center', minWidth: 0 },
    track: { width: '100%', justifyContent: 'flex-end' },
    bar: { width: '100%', borderRadius: radius.xs },
    value: { ...typography.caption, fontWeight: fontWeight.semibold, color: colors.ink2, marginBottom: space[1] },
    label: { ...typography.caption, color: colors.ink2, marginTop: space[1] },
  });
}
