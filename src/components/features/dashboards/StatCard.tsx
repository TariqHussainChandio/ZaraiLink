import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '../../../components/ui';
import { useTheme, type Theme } from '../../../theme';

export interface StatCardProps {
  label: string;
  value: string | number;
  /** Ties the card to a module (e.g. `theme.moduleAccents.orders`) via a left accent bar.
   * Defaults to the brand color for stats that don't belong to one specific module. */
  accent?: string;
}

export function StatCard({ label, value, accent }: StatCardProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <Card style={styles.card}>
      <View testID="stat-card-accent" style={[styles.accentBar, { backgroundColor: accent ?? theme.colors.brand.primary }]} />
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </Card>
  );
}

function makeStyles({ colors, spacing, radii, typography }: Theme) {
  return StyleSheet.create({
    card: {
      flex: 1,
      alignItems: 'flex-start',
      overflow: 'hidden',
      paddingLeft: spacing.lg + spacing.xs,
    },
    accentBar: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 4,
      borderTopLeftRadius: radii.lg,
      borderBottomLeftRadius: radii.lg,
    },
    value: {
      fontSize: typography.sizes['2xl'],
      fontWeight: typography.weights.bold as any,
      color: colors.text.primary,
    },
    label: {
      marginTop: spacing.xs / 2,
      fontSize: typography.sizes.xs,
      color: colors.text.secondary,
    },
  });
}
