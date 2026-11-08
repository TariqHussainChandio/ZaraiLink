import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, ListGroup, ListRow, QueryState, ScreenScaffold, StatusBadge } from '../../common/components';
import { RecordStockSheet, type RecordKind } from '../components/RecordStockSheet';
import { formatQuantity, itemName, stockLevel } from '../components/stock';
import { useInventoryItem, useInventoryTransactions } from '../hooks/dealer';
import { useTheme, type Theme } from '../../theme';
import type { InventoryTransaction } from '../types/dealer';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';
import { formatWhen } from '../../utils/dates';

// The movement list is one page of the newest 100 (the API's cap). Past that, the balance before the oldest row shown is
// not "opening stock", so no opening row is drawn.
const LEDGER_PAGE = 100;

/** The marketplace takes stock off the shelf by itself when an order is dispatched (SRDS §51). Its note reads
 * "Order <id> dispatched": the id is for the database, not the dealer. */
function isMarketplaceOrder(tx: InventoryTransaction): boolean {
  return tx.type === 'sale' && (tx.notes ?? '').startsWith('Order ');
}

function movementLabel(tx: InventoryTransaction): string {
  if (isMarketplaceOrder(tx)) return 'Marketplace order';
  switch (tx.type) {
    case 'addition':
    case 'restock':
      return 'Stock in';
    case 'reduction':
      return 'Stock out';
    case 'sale':
      return 'Sale';
    default:
      return 'Count';
  }
}

/** A signed change, with a real minus sign so the direction never depends on colour. */
function signed(quantity: number, unit: string): string {
  if (quantity === 0) return 'No change';
  return `${quantity > 0 ? '+' : '−'}${formatQuantity(Math.abs(quantity), unit)}`;
}

/** One stock item: how much there is, the three things to record, and its movements newest first, each with the stock
 * left after it. */
export function InventoryTransactionScreen({ route }: HomeScreenProps<'InventoryTransactions'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { inventoryId } = route.params;
  const itemQuery = useInventoryItem(inventoryId);
  const transactionsQuery = useInventoryTransactions(inventoryId);
  const item = itemQuery.data;
  const [recording, setRecording] = useState<RecordKind | null>(null);

  const { refetch: refetchItem } = itemQuery;
  const { refetch: refetchTransactions } = transactionsQuery;
  const load = useCallback(() => {
    refetchItem();
    refetchTransactions();
  }, [refetchItem, refetchTransactions]);

  useFocusEffect(load);

  // Newest first, as the API sends them. The newest row's balance is the stock now; each older one is that minus the
  // changes made since.
  const ledger = useMemo(() => {
    if (!item) return { rows: [], opening: null as number | null };
    const sorted = [...(transactionsQuery.data ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
    let balance = item.stock_quantity;
    const rows = sorted.map(tx => {
      const row = { tx, balance };
      balance -= tx.quantity;
      return row;
    });
    return { rows, opening: sorted.length < LEDGER_PAGE && balance > 0 ? balance : null };
  }, [item, transactionsQuery.data]);

  const name = item ? itemName(item) : '';

  return (
    <ScreenScaffold
      onRefresh={load}
      refreshing={itemQuery.isRefetching || transactionsQuery.isRefetching}
    >
      <QueryState query={itemQuery} failureTitle="Couldn't load this item">
        {item ? (
          <>
            <Card style={styles.summary}>
              <Text style={styles.name}>{name}</Text>
              <StatusBadge kind="stock" status={stockLevel(item)} />
              <View style={styles.now} accessible accessibilityLabel={`In stock now: ${formatQuantity(item.stock_quantity, item.unit)}`}>
                <Text style={styles.nowLabel}>In stock now</Text>
                <Text style={styles.nowFigure}>{formatQuantity(item.stock_quantity, item.unit)}</Text>
              </View>
              <View style={styles.actions}>
                {(
                  [
                    ['in', 'Stock in'],
                    ['out', 'Stock out'],
                    ['count', 'Count'],
                  ] as const
                ).map(([kind, label]) => (
                  <Button
                    key={kind}
                    label={label}
                    accessibilityLabel={`${label} for ${name}`}
                    variant={kind === 'in' ? 'primary' : 'secondary'}
                    size="sm"
                    fullWidth={false}
                    onPress={() => setRecording(kind)}
                    style={styles.action}
                  />
                ))}
              </View>
            </Card>

            <Text style={styles.heading} accessibilityRole="header">
              Stock history
            </Text>
            <QueryState
              query={transactionsQuery}
              isEmpty={ledger.rows.length === 0}
              empty={{ title: 'No stock movements yet', description: 'Stock in, stock out and counts you record appear here.' }}
              failureTitle="Couldn't load the stock history"
            >
              <ListGroup>
                {ledger.rows.map(({ tx, balance }) => (
                  <ListRow
                    key={tx.id}
                    title={movementLabel(tx)}
                    meta={[formatWhen(tx.created_at), isMarketplaceOrder(tx) ? null : tx.notes].filter(Boolean).join(' · ')}
                    trailing={
                      <View>
                        <Text style={styles.change}>{signed(tx.quantity, item.unit)}</Text>
                        <Text style={styles.balance}>{`Balance ${formatQuantity(balance, item.unit)}`}</Text>
                      </View>
                    }
                  />
                ))}
                {ledger.opening !== null ? (
                  <ListRow
                    title="Opening stock"
                    meta="Before the first record"
                    trailing={<Text style={styles.balance}>{`Balance ${formatQuantity(ledger.opening, item.unit)}`}</Text>}
                  />
                ) : null}
              </ListGroup>
            </QueryState>
          </>
        ) : null}
      </QueryState>

      {item && recording ? (
        <RecordStockSheet
          inventoryId={inventoryId}
          itemName={name}
          unit={item.unit}
          currentStock={item.stock_quantity}
          initialKind={recording}
          onClose={() => setRecording(null)}
        />
      ) : null}
    </ScreenScaffold>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    summary: { gap: space[3], alignItems: 'flex-start' },
    name: { ...typography.titleLg, color: colors.ink },
    now: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', alignSelf: 'stretch', gap: space[3] },
    nowLabel: { ...typography.body, color: colors.ink2 },
    nowFigure: { ...typography.figureLg, color: colors.ink },
    actions: { flexDirection: 'row', gap: space[2], alignSelf: 'stretch' },
    action: { flex: 1 },
    heading: { ...typography.title, color: colors.ink },
    change: { ...typography.figure, color: colors.ink, textAlign: 'right' },
    balance: { ...typography.figure, color: colors.ink2, textAlign: 'right' },
  });
}
