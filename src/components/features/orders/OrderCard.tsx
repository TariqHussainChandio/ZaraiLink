import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Card } from '../../../components/ui';
import { useTheme, type Theme } from '../../../theme';
import type { OrderWithItems } from '../../../types/orders';
import { StatusBadge } from './StatusBadge';

export interface OrderCardProps {
  order: OrderWithItems;
  counterpartyName: string;
  onPress: () => void;
}

export function OrderCard({ order, counterpartyName, onPress }: OrderCardProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`Order with ${counterpartyName}, Rs. ${order.total.toFixed(0)}, ${order.status}`}
    >
      <Card style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.counterparty}>{counterpartyName}</Text>
          <StatusBadge status={order.status} />
        </View>
        <Text style={styles.meta}>
          {order.order_items.length} item{order.order_items.length === 1 ? '' : 's'} · Rs.{' '}
          {order.total.toFixed(0)}
        </Text>
        <Text style={styles.date}>{new Date(order.created_at).toLocaleDateString()}</Text>
      </Card>
    </TouchableOpacity>
  );
}

function makeStyles({ colors, spacing, typography }: Theme) {
  return StyleSheet.create({
    card: {
      marginBottom: spacing.md,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.xs,
    },
    counterparty: {
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold as any,
      color: colors.text.primary,
    },
    meta: {
      fontSize: typography.sizes.sm,
      color: colors.text.secondary,
    },
    date: {
      marginTop: spacing.xs / 2,
      fontSize: typography.sizes.xs,
      color: colors.text.secondary,
    },
  });
}
