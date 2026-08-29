import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Card } from '../../../components/ui';
import { lightTheme } from '../../../theme';
import type { OrderWithItems } from '../../../types/orders';
import { StatusBadge } from './StatusBadge';

export interface OrderCardProps {
  order: OrderWithItems;
  counterpartyName: string;
  onPress: () => void;
}

const { colors, spacing, typography } = lightTheme;

export function OrderCard({ order, counterpartyName, onPress }: OrderCardProps) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
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

const styles = StyleSheet.create({
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
    color: colors.neutral.gray900,
  },
  meta: {
    fontSize: typography.sizes.sm,
    color: colors.neutral.gray600,
  },
  date: {
    marginTop: spacing.xs / 2,
    fontSize: typography.sizes.xs,
    color: colors.neutral.gray400,
  },
});
