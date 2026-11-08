import React, { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { ListGroup, ListRow, StatusBadge } from '../../components';
import { useTheme, type Theme } from '../../../theme';
import type { OrderWithItems } from '../types/orders';
import { formatDay } from '../../../utils/dates';
import { formatAmount, formatRs } from '../../../utils/money';

export interface OrderCardProps {
  order: OrderWithItems;
  counterpartyName: string;
  onPress: () => void;
}

/** What was bought, in a line: "3 × Urea, 2 × Wheat seed". "2 items" hid it. Past two lines it counts the rest. */
function itemsSummary(order: OrderWithItems): string {
  const parts = order.order_items.map(item => `${formatAmount(item.quantity)} × ${item.listing?.title ?? 'Listing removed'}`);
  return parts.length > 2 ? `${parts.slice(0, 2).join(', ')} and ${parts.length - 2} more` : parts.join(', ');
}

/** One order in a list: who it is with, what is in it, the day, the total (in the board face) and its status under the
 * meta. The whole row is one button and reads the total and status aloud. */
export function OrderCard({ order, counterpartyName, onPress }: OrderCardProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <ListGroup>
      <ListRow
        title={counterpartyName}
        meta={`${itemsSummary(order)} · ${formatDay(order.created_at)}`}
        trailing={<Text style={styles.total}>{formatRs(order.total)}</Text>}
        status={<StatusBadge kind="order" status={order.status} />}
        onPress={onPress}
      />
    </ListGroup>
  );
}

function makeStyles({ colors, typography }: Theme) {
  return StyleSheet.create({
    total: { ...typography.price, color: colors.ink },
  });
}
