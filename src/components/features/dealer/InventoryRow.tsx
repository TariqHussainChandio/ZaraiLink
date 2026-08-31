import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Badge, Card } from '../../ui';
import { useTheme, type Theme } from '../../../theme';
import type { InventoryItemWithListing } from '../../../types/dealer';

export interface InventoryRowProps {
  item: InventoryItemWithListing;
  onPress: () => void;
  onAdjust: () => void;
  onHistory: () => void;
}

export function InventoryRow({ item, onPress, onAdjust, onHistory }: InventoryRowProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
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
          <Text style={styles.meta}>Selling price: Rs. {item.selling_price.toFixed(0)}</Text>
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

function makeStyles({ colors, spacing, typography }: Theme) {
  return StyleSheet.create({
    card: {
      marginBottom: spacing.md,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    title: {
      flex: 1,
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold as any,
      color: colors.text.primary,
      marginRight: spacing.sm,
    },
    meta: {
      marginTop: spacing.xs / 2,
      fontSize: typography.sizes.sm,
      color: colors.text.secondary,
    },
    actions: {
      flexDirection: 'row',
      gap: spacing.lg,
      marginTop: spacing.sm,
    },
    actionButton: {
      paddingVertical: spacing.xs,
    },
    actionLabel: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.semibold as any,
      color: colors.brand.primary,
    },
  });
}
