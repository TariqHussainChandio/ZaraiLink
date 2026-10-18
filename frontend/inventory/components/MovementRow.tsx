import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ListRow, StatusBadge } from '../../common/components';
import { type Theme, useTheme } from '../../theme';
import type { Movement } from '../types/inventory';
import { formatDateTime, formatQuantity, formatSigned } from './format';

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
  return (
    <ListRow
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

function makeStyles({ colors, typography }: Theme) {
  return StyleSheet.create({
    figures: { alignItems: 'flex-end' },
    in: { ...typography.figure, color: colors.status.success.ink },
    out: { ...typography.figure, color: colors.ink },
    after: { ...typography.caption, color: colors.ink2 },
  });
}
