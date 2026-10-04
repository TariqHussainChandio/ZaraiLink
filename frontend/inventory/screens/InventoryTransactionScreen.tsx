import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Badge, Card, EmptyState, Spinner } from '../../common/components';
import { StockAdjustModal } from '../components/StockAdjustModal';
import { useInventoryItem, useInventoryTransactions } from '../hooks/dealer';
import { useTheme, type Theme, useRoleAccent, type Accent } from '../../theme';
import type { InventoryTransaction } from '../types/dealer';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

const TYPE_LABELS: Record<InventoryTransaction['type'], string> = {
  addition: 'Addition',
  restock: 'Restock',
  reduction: 'Reduction',
  sale: 'Sale',
  adjustment: 'Adjustment',
  correction: 'Correction',
};

export function InventoryTransactionScreen({ route }: HomeScreenProps<'InventoryTransactions'>) {
  const theme = useTheme();
  const accent = useRoleAccent();
  const styles = useMemo(() => makeStyles(theme, accent), [theme, accent]);
  const { inventoryId } = route.params;
  const itemQuery = useInventoryItem(inventoryId);
  const transactionsQuery = useInventoryTransactions(inventoryId);
  const item = itemQuery.data;
  const transactions = transactionsQuery.data ?? [];
  const loading = itemQuery.isPending || transactionsQuery.isPending;
  const error = itemQuery.error ?? transactionsQuery.error;
  const [adjustVisible, setAdjustVisible] = useState(false);

  const { refetch: refetchItem } = itemQuery;
  const { refetch: refetchTransactions } = transactionsQuery;
  const load = useCallback(() => {
    refetchItem();
    refetchTransactions();
  }, [refetchItem, refetchTransactions]);

  useFocusEffect(load);

  if (loading) return <Spinner fullscreen />;
  if (error || !item) {
    return (
      <EmptyState
        title="Couldn't load stock history"
        description="Check your connection and try again."
        actionLabel="Retry"
        onAction={load}
      />
    );
  }

  return (
    <View style={styles.container}>
      <Card style={styles.summary}>
        <Text style={styles.title}>
          {item.listing?.title ?? 'Unlinked stock item'}
        </Text>
        <Text style={styles.stock}>
          {`${item.stock_quantity} ${item.unit} currently in stock`}
        </Text>
        <TouchableOpacity style={styles.adjustButton} onPress={() => setAdjustVisible(true)}>
          <Text style={styles.adjustLabel}>Record Stock Movement</Text>
        </TouchableOpacity>
      </Card>

      <FlashList
        data={transactions}
        keyExtractor={tx => tx.id}
        contentContainerStyle={styles.list}
        renderItem={({ item: tx }) => (
          <Card style={styles.txCard}>
            <View style={styles.txRow}>
              <Badge label={TYPE_LABELS[tx.type]} tone={tx.quantity >= 0 ? 'success' : 'neutral'} />
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
      />
    </View>
  );
}

function makeStyles({ colors, space, radius, typography }: Theme, accent: Accent) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    summary: {
      margin: space[4],
      marginBottom: 0,
    },
    title: {
      ...typography.title,
      color: colors.ink,
    },
    stock: {
      marginTop: space[1],
      ...typography.caption,
      color: colors.ink2,
    },
    adjustButton: {
      marginTop: space[3],
      alignSelf: 'flex-start',
      backgroundColor: accent.fill,
      paddingHorizontal: space[3],
      paddingVertical: space[2],
      borderRadius: radius.sm,
    },
    adjustLabel: {
      ...typography.label,
      color: colors.onAccent,
      ...typography.caption,
    },
    list: {
      padding: space[4],
      paddingBottom: space[12],
    },
    txCard: {
      marginBottom: space[3],
    },
    txRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    txQuantity: {
      ...typography.bodyStrong,
      color: colors.ink,
    },
    txDate: {
      marginTop: space[1] / 2,
      ...typography.caption,
      color: colors.ink2,
    },
    txNotes: {
      marginTop: space[1] / 2,
      ...typography.caption,
      color: colors.ink2,
    },
  });
}
