import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Badge, Card, EmptyState, Spinner } from '../../components/ui';
import { StockAdjustModal } from '../../components/features/dealer/StockAdjustModal';
import {
  fetchInventoryById,
  fetchInventoryTransactions,
} from '../../services/modules/dealer/inventoryService';
import { useTheme, type Theme } from '../../theme';
import type { InventoryItemWithListing, InventoryTransaction } from '../../types/dealer';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

const TYPE_LABEL_KEYS: Record<InventoryTransaction['type'], string> = {
  addition: 'dealer.inventoryTransaction.types.addition',
  restock: 'dealer.inventoryTransaction.types.restock',
  reduction: 'dealer.inventoryTransaction.types.reduction',
  sale: 'dealer.inventoryTransaction.types.sale',
  adjustment: 'dealer.inventoryTransaction.types.adjustment',
  correction: 'dealer.inventoryTransaction.types.correction',
};

export function InventoryTransactionScreen({ route }: HomeScreenProps<'InventoryTransactions'>) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { inventoryId } = route.params;
  const [item, setItem] = useState<InventoryItemWithListing | null>(null);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [adjustVisible, setAdjustVisible] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    Promise.all([fetchInventoryById(inventoryId), fetchInventoryTransactions(inventoryId)]).then(
      ([inv, txs]) => {
        setItem(inv);
        setTransactions(txs);
        setLoading(false);
      },
    ).catch(err => {
      console.warn('[InventoryTransactionScreen] failed to load inventory transactions:', err);
      setError(true);
      setLoading(false);
    });
  }, [inventoryId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading) return <Spinner fullscreen />;
  if (error || !item) {
    return (
      <EmptyState
        title={t('dealer.inventoryTransaction.couldntLoadTitle')}
        description={t('dealer.shared.checkConnectionDescription')}
        actionLabel={t('common.retry')}
        onAction={load}
      />
    );
  }

  return (
    <View style={styles.container}>
      <Card style={styles.summary}>
        <Text style={styles.title}>
          {item.listing?.title ?? t('dealer.inventoryTransaction.unlinkedStockItem')}
        </Text>
        <Text style={styles.stock}>
          {t('dealer.inventoryTransaction.currentlyInStock', {
            quantity: item.stock_quantity,
            unit: item.unit,
          })}
        </Text>
        <TouchableOpacity style={styles.adjustButton} onPress={() => setAdjustVisible(true)}>
          <Text style={styles.adjustLabel}>{t('dealer.inventoryTransaction.recordStockMovement')}</Text>
        </TouchableOpacity>
      </Card>

      <FlatList
        data={transactions}
        keyExtractor={tx => tx.id}
        contentContainerStyle={styles.list}
        renderItem={({ item: tx }) => (
          <Card style={styles.txCard}>
            <View style={styles.txRow}>
              <Badge label={t(TYPE_LABEL_KEYS[tx.type])} tone={tx.quantity >= 0 ? 'success' : 'error'} />
              <Text style={styles.txQuantity}>
                {tx.quantity >= 0 ? '+' : ''}
                {tx.quantity} {item.unit}
              </Text>
            </View>
            <Text style={styles.txDate}>{new Date(tx.created_at).toLocaleString()}</Text>
            {tx.notes ? <Text style={styles.txNotes}>{tx.notes}</Text> : null}
          </Card>
        )}
        ListEmptyComponent={<EmptyState title={t('dealer.inventoryTransaction.emptyTitle')} />}
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

function makeStyles({ colors, spacing, radii, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.surface,
    },
    summary: {
      margin: spacing.lg,
      marginBottom: 0,
    },
    title: {
      fontSize: typography.sizes.lg,
      fontWeight: typography.weights.semibold as any,
      color: colors.text.primary,
    },
    stock: {
      marginTop: spacing.xs,
      fontSize: typography.sizes.sm,
      color: colors.text.secondary,
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
      color: colors.text.primary,
    },
    txDate: {
      marginTop: spacing.xs / 2,
      fontSize: typography.sizes.xs,
      color: colors.text.secondary,
    },
    txNotes: {
      marginTop: spacing.xs / 2,
      fontSize: typography.sizes.sm,
      color: colors.text.secondary,
    },
  });
}
