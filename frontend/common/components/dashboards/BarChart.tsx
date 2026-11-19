import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { EmptyState } from '../EmptyState';
import { useTheme, type Theme } from '../../../theme';

export interface BarChartDatum {
  label: string;
  value: number;
}

export interface BarChartProps {
  data: BarChartDatum[];
  color: string;
  /** Height of the chart's bar area in px. */
  height?: number;
  formatValue?: (value: number) => string;
  emptyMessage?: string;
  /** What TalkBack reads for the whole chart. Defaults to a summary: how many bars and the highest one. */
  accessibilityLabel?: string;
}

/** The sentence TalkBack reads for a chart it cannot see: "7 bars. Highest: Mon, Rs 1,200." */
export function summarizeBars(data: BarChartDatum[], formatValue?: (value: number) => string): string {
  const [first, ...rest] = data;
  if (!first) return '';
  const top = rest.reduce((best, d) => (d.value > best.value ? d : best), first);
  const shown = formatValue ? formatValue(top.value) : String(top.value);
  return `${data.length} ${data.length === 1 ? 'bar' : 'bars'}. Highest: ${top.label}, ${shown}.`;
}

/** A small vertical bar chart for a dashboard, read by TalkBack as one summary.
 *
 * @example
 * <BarChart data={[{ label: 'Mon', value: 1200 }]} color={accent.mark} formatValue={formatRs} />
 */
export function BarChart({
  data,
  color,
  height = 140,
  formatValue,
  emptyMessage = 'No data yet',
  accessibilityLabel,
}: BarChartProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  if (data.length === 0) {
    return <EmptyState title={emptyMessage} />;
  }

  const max = Math.max(1, ...data.map(d => d.value));

  return (
    // One stop: bar-by-bar figures in tiny labels are noise to a screen reader; the summary says what the chart shows.
    <View
      style={[styles.barsRow, { height }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? summarizeBars(data, formatValue)}
    >
      {data.map(d => (
        <View key={d.label} style={styles.barColumn}>
          <Text style={styles.barValue} numberOfLines={1}>
            {formatValue ? formatValue(d.value) : d.value}
          </Text>
          <View style={styles.barTrack}>
            <View
              testID={`bar-${d.label}`}
              style={[
                styles.bar,
                {
                  height: Math.max(4, (d.value / max) * (height - 40)),
                  backgroundColor: color,
                },
              ]}
            />
          </View>
          <Text style={styles.barLabel} numberOfLines={1}>
            {d.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function makeStyles({ colors, space, radius, typography, fontWeight }: Theme) {
  return StyleSheet.create({
    barsRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: space[2],
    },
    barColumn: {
      flex: 1,
      alignItems: 'center',
    },
    barTrack: {
      flex: 1,
      width: '100%',
      justifyContent: 'flex-end',
    },
    bar: {
      width: '100%',
      borderRadius: radius.xs,
    },
    barValue: {
      ...typography.caption,
      fontWeight: fontWeight.semibold,
      color: colors.ink2,
      marginBottom: space[1],
    },
    barLabel: {
      marginTop: space[1],
      ...typography.caption,
      color: colors.ink2,
    },
  });
}
