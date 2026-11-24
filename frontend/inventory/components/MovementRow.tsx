// Inventory: one row of the stock ledger.
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatusBadge } from '../../common/components';
import { statusMeta } from '../../common/constants/status';
import { type Theme, useTheme } from '../../theme';
import type { Movement } from '../types/inventory';
import { formatDateTime, formatQuantity, formatSigned } from './format';
import { SpokenRow } from './SpokenRow';

export interface MovementRowProps {
  movement: Movement;
  /** The product's name; the ledger row carries only its id. */
  productName?: string;
  locationName?: string;
}

/** One ledger line: what moved, where from, the signed quantity and the stock after it (SRDS §22). */
export function MovementRow({ movement, productName, locationName }: MovementRowProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const meta = [locationName, formatDateTime(movement.created_at), movement.reason].filter(Boolean).join(' · ');
  // One stop for TalkBack (A8): "Local sale, Urea 50kg, out 4, now 26, Main shop, 10 Oct, 3:00 pm".
  const label = [
    statusMeta('movement', movement.source).label,
    productName ?? 'Product',
    `${movement.direction === 'in' ? 'in' : 'out'} ${formatQuantity(movement.quantity)}`,
    `now ${formatQuantity(movement.quantity_after)}`,
    locationName,
    formatDateTime(movement.created_at),
    movement.reason,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <SpokenRow
      label={label}
      title={productName ?? 'Product'}
      meta={meta}
      leading={<StatusBadge kind="movement" status={movement.source} size="sm" />}
      trailing={
        <View style={styles.figures}>
          <Text style={movement.direction === 'in' ? styles.in : styles.out}>
            {formatSigned(movement.quantity, movement.direction)}
          </Text>
          <Text style={styles.after}>{`Now ${formatQuantity(movement.quantity_after)}`}</Text>
        </View>
      }
    />
  );
}

// Builds this component's styles from the theme.
function makeStyles({ colors, typography }: Theme) {
  return StyleSheet.create({
    figures: { alignItems: 'flex-end' },
    in: { ...typography.figure, color: colors.status.success.ink },
    out: { ...typography.figure, color: colors.ink },
    after: { ...typography.caption, color: colors.ink2 },
  });
}
