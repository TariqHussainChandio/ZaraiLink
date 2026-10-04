import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Badge, Card } from '../../common/components';
import { useTheme, type Theme, useRoleAccent, type Accent } from '../../theme';
import type { InventoryItemWithListing } from '../types/dealer';
import { formatRs } from '../../utils/money';

export interface InventoryRowProps {
  item: InventoryItemWithListing;
  onPress: () => void;
  onAdjust: () => void;
  onHistory: () => void;
}

export function InventoryRow({ item, onPress, onAdjust, onHistory }: InventoryRowProps) {
  const theme = useTheme();
  const accent = useRoleAccent();
  const styles = useMemo(() => makeStyles(theme, accent), [theme, accent]);
  const lowStock = item.stock_quantity <= item.min_stock_threshold;

  return (
    <Card style={styles.card}>
      <TouchableOpacity onPress={onPress}>
        <View style={styles.row}>
          <Text style={styles.title} numberOfLines={1}>
            {item.listing?.title ?? 'Unlinked stock item'}
          </Text>
          {lowStock ? <Badge label="Low stock" tone="warning" /> : null}
        </View>
        <Text style={styles.meta}>
          {item.stock_quantity} {item.unit} in stock
        </Text>
        {item.selling_price !== null ? (
          <Text style={styles.meta}>Selling price: {formatRs(item.selling_price)}</Text>
        ) : null}
      </TouchableOpacity>
      <View style={styles.actions}>
        <TouchableOpacity onPress={onAdjust} style={styles.actionButton}>
          <Text style={styles.actionLabel}>Adjust Stock</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onHistory} style={styles.actionButton}>
          <Text style={styles.actionLabel}>History</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );
}

function makeStyles({ colors, space, typography, fontWeight }: Theme, accent: Accent) {
  return StyleSheet.create({
    card: {
      marginBottom: space[3],
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    title: {
      flex: 1,
      ...typography.bodyStrong,
      color: colors.ink,
      marginRight: space[2],
    },
    meta: {
      marginTop: space[1] / 2,
      ...typography.caption,
      color: colors.ink2,
    },
    actions: {
      flexDirection: 'row',
      gap: space[4],
      marginTop: space[2],
    },
    actionButton: {
      paddingVertical: space[1],
    },
    actionLabel: {
      ...typography.caption,
      fontWeight: fontWeight.semibold,
      color: accent.ink,
    },
  });
}
