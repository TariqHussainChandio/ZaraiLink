import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Card, StatusBadge } from '../../components';
import { useTheme, type Theme } from '../../../theme';
import type { OrderWithItems } from '../types/orders';
import { formatRs } from '../../../utils/money';
import { statusMeta } from '../../constants/status';

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
      accessibilityLabel={`Order with ${counterpartyName}, ${formatRs(order.total)}, ${statusMeta('order', order.status).label}`}
    >
      <Card style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.counterparty}>{counterpartyName}</Text>
          <StatusBadge kind="order" status={order.status} />
        </View>
        <Text style={styles.meta}>
          {order.order_items.length} item{order.order_items.length === 1 ? '' : 's'} · {formatRs(order.total)}
        </Text>
        <Text style={styles.date}>{new Date(order.created_at).toLocaleDateString()}</Text>
      </Card>
    </TouchableOpacity>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    card: {
      marginBottom: space[3],
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: space[1],
    },
    counterparty: {
      ...typography.bodyStrong,
      color: colors.ink,
    },
    meta: {
      ...typography.caption,
      color: colors.ink2,
    },
    date: {
      marginTop: space[1] / 2,
      ...typography.caption,
      color: colors.ink2,
    },
  });
}
