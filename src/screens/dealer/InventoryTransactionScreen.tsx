import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Badge, Card, EmptyState, Spinner } from '../../components/ui';
import { StockAdjustModal } from '../../components/features/dealer/StockAdjustModal';
import {
  fetchInventoryById,
  fetchInventoryTransactions,
} from '../../services/modules/dealer/inventoryService';
import { lightTheme } from '../../theme';
import type { InventoryItemWithListing, InventoryTransaction } from '../../types/dealer';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

const { colors, spacing, radii, typography } = lightTheme;

const TYPE_LABELS: Record<InventoryTransaction['type'], string> = {
  addition: 'Addition',
  restock: 'Restock',
  reduction: 'Reduction',
  sale: 'Sale',
  adjustment: 'Adjustment',
  correction: 'Correction',
};

export function InventoryTransactionScreen({ route }: HomeScreenProps<'InventoryTransactions'>) {
  const { inventoryId } = route.params;
  const [item, setItem] = useState<InventoryItemWithListing | null>(null);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [adjustVisible, setAdjustVisible] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([fetchInventoryById(inventoryId), fetchInventoryTransactions(inventoryId)]).then(
      ([inv, txs]) => {
        setItem(inv);
        setTransactions(txs);
        setLoading(false);
      },
    ).catch(err => {
      console.warn('[InventoryTransactionScreen] failed to load inventory transactions:', err);
      setLoading(false);
    });
  }, [inventoryId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading || !item) return <Spinner fullscreen />;

  return (
    <View style={styles.container}>
      <Card style={styles.summary}>
        <Text style={styles.title}>{item.listing?.title ?? 'Unlinked stock item'}</Text>
        <Text style={styles.stock}>
          {item.stock_quantity} {item.unit} currently in stock
        </Text>
        <TouchableOpacity style={styles.adjustButton} onPress={() => setAdjustVisible(true)}>
          <Text style={styles.adjustLabel}>Record Stock Movement</Text>
        </TouchableOpacity>
      </Card>

      <FlatList
        data={transactions}
        keyExtractor={tx => tx.id}
        contentContainerStyle={styles.list}
        renderItem={({ item: tx }) => (
          <Card style={styles.txCard}>
            <View style={styles.txRow}>
              <Badge label={TYPE_LABELS[tx.type]} tone={tx.quantity >= 0 ? 'success' : 'error'} />
              <Text style={styles.txQuantity}>
                {tx.quantity >= 0 ? '+' : ''}
                {tx.quantity} {item.unit}
              </Text>
            </View>
            <Text style={styles.txDate}>{new Date(tx.created_at).toLocaleString()}</Text>
            {tx.notes ? <Text style={styles.txNotes}>{tx.notes}</Text> : null}
          </Card>
        )}
        ListEmptyComponent={<EmptyState title="No stock movements yet" />}
      />

      <StockAdjustModal
        visible={adjustVisible}
        onClose={() => setAdjustVisible(false)}
        inventoryId={inventoryId}
        unit={item.unit}
        onAdjusted={load}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
  },
  summary: {
    margin: spacing.lg,
    marginBottom: 0,
  },
  title: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold as any,
    color: colors.neutral.gray900,
  },
  stock: {
    marginTop: spacing.xs,
    fontSize: typography.sizes.sm,
    color: colors.neutral.gray500,
  },
  adjustButton: {
    marginTop: spacing.md,
    alignSelf: 'flex-start',
    backgroundColor: colors.brand.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
  },
  adjustLabel: {
    color: colors.neutral.white,
    fontWeight: '700',
    fontSize: typography.sizes.sm,
  },
  list: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  txCard: {
    marginBottom: spacing.md,
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  txQuantity: {
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold as any,
    color: colors.neutral.gray900,
  },
  txDate: {
    marginTop: spacing.xs / 2,
    fontSize: typography.sizes.xs,
    color: colors.neutral.gray500,
  },
  txNotes: {
    marginTop: spacing.xs / 2,
    fontSize: typography.sizes.sm,
    color: colors.neutral.gray700,
  },
});
