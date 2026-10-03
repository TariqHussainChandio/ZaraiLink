import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { EmptyState } from '..';
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
}

export function BarChart({
  data,
  color,
  height = 140,
  formatValue,
  emptyMessage = 'No data yet',
}: BarChartProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  if (data.length === 0) {
    return <EmptyState title={emptyMessage} />;
  }

  const max = Math.max(1, ...data.map(d => d.value));

  return (
    <View style={[styles.barsRow, { height }]}>
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
