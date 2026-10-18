import { FlashList } from '@shopify/flash-list';
import { Scale } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { RefreshControl, Text, View } from 'react-native';
import { Button, Card, EmptyState, ScreenState, StatusBadge } from '../../common/components';
import { type Theme, useTheme } from '../../theme';
import { ExportButton } from '../components/ExportButton';
import { formatDateTime, formatNet, formatQuantity } from '../components/format';
import { makeScreenStyles } from '../components/screenStyles';
import { useReconciliationReport } from '../hooks/inventory';
import { useLookups } from '../hooks/lookups';
import type { ReconciliationReportRow } from '../types/inventory';
import { INVENTORY_ROUTES, type InventoryScreenProps } from '../types/navigation';

// The SRDS §25 terms, in the order the identity adds them. Each is already signed by the server (sales and losses
// negative), so the ledger total is their sum and must equal the stock on hand.
const TERMS: { key: keyof ReconciliationReportRow; label: string }[] = [
  { key: 'marketplace_sales', label: 'Marketplace sales' },
  { key: 'local_sales', label: 'Local sales' },
  { key: 'adjustments', label: 'Adjustments' },
  { key: 'restocks_and_purchases', label: 'Restocks and purchases' },
  { key: 'losses', label: 'Damage and expiry' },
  { key: 'transfers', label: 'Transfers' },
  { key: 'other', label: 'Other' },
];

/**
 * Reconciliation (SRDS §25): for every product, whether its ledger adds up to the stock on hand, over all time. The
 * server sorts the products that do not add up first, since they are what the dealer has to look into (a marketplace
 * sync still pending, SRDS §53.39, or stock changed outside the stock functions).
 */
export function ReconciliationScreen({ navigation }: InventoryScreenProps<typeof INVENTORY_ROUTES.Reconciliation>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const result = useReconciliationReport();
  const { data, refetch, isRefetching } = result;
  const { productById } = useLookups();
  const rows = data?.rows ?? [];

  const renderRow = ({ item: row }: { item: ReconciliationReportRow }) => {
    const unit = productById.get(row.product_id)?.unit;
    const status = row.balanced ? 'balanced' : 'unbalanced';
    return (
      <Card style={styles.card}>
        <View style={styles.row}>
          <View style={styles.grow}>
            <Text style={styles.name}>{row.name}</Text>
            <Text style={styles.caption}>{row.sku}</Text>
          </View>
          <StatusBadge kind="reconciliation" status={status} size="sm" />
        </View>
        {TERMS.map(term => (
          <View key={term.key} style={styles.line}>
            <Text style={styles.caption}>{term.label}</Text>
            <Text style={styles.number}>{formatNet(Number(row[term.key]))}</Text>
          </View>
        ))}
        <View style={[styles.line, styles.total]}>
          <Text style={styles.body}>Ledger total</Text>
          <Text style={styles.number}>{formatQuantity(row.ledger_total, unit)}</Text>
        </View>
        <View style={styles.line}>
          <Text style={styles.body}>Stock on hand</Text>
          <Text style={[styles.number, !row.balanced && styles.mismatch]}>{formatQuantity(row.current_stock, unit)}</Text>
        </View>
        {row.balanced ? null : (
          // How far the stock is from what the ledger explains: positive means more on hand than the movements account for.
          <Text style={[styles.body, styles.mismatch]}>
            {`Out by ${formatNet(row.current_stock - row.ledger_total)}${unit ? ` ${unit}` : ''}`}
          </Text>
        )}
        {row.balanced ? null : (
          <Button
            label="See movement history"
            variant="quiet"
            size="sm"
            fullWidth={false}
            accessibilityLabel={`See movement history of ${row.name}`}
            onPress={() => navigation.navigate(INVENTORY_ROUTES.Movements, { productId: row.product_id })}
          />
        )}
      </Card>
    );
  };

  return (
    <View style={styles.screen}>
      <FlashList
        data={rows}
        keyExtractor={row => row.product_id}
        renderItem={renderRow}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
        ListHeaderComponent={
          <View style={styles.header}>
            {data ? (
              <>
                <Text style={styles.body}>
                  {data.unbalanced === 0
                    ? 'Every product’s movements add up to its stock on hand.'
                    : data.unbalanced === 1
                      ? `1 of ${rows.length} products does not add up. Check its movement history.`
                      : `${data.unbalanced} of ${rows.length} products do not add up. Check their movement history.`}
                </Text>
                <Text style={styles.caption}>{`Checked ${formatDateTime(data.generated_at)}`}</Text>
              </>
            ) : null}
            <ExportButton report="reconciliation" />
            {data && result.isError ? <ScreenState query={result} errorTitle="Couldn't refresh the reconciliation" /> : null}
          </View>
        }
        ListEmptyComponent={
          data ? (
            <EmptyState icon={Scale} title="Nothing to reconcile" description="Products appear here once stock has moved." />
          ) : (
            <ScreenState query={result} errorTitle="Couldn't load the reconciliation" />
          )
        }
      />
    </View>
  );
}

function makeStyles(theme: Theme) {
  return {
    ...makeScreenStyles(theme),
    list: { padding: theme.space[4], paddingBottom: theme.space[12] },
    header: { gap: theme.space[3], marginBottom: theme.space[3] },
    card: { gap: theme.space[1], marginBottom: theme.space[3] },
    name: { ...theme.typography.bodyStrong, color: theme.colors.ink },
    line: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const },
    total: {
      borderTopWidth: theme.borders.hairline,
      borderTopColor: theme.colors.line,
      paddingTop: theme.space[1],
      marginTop: theme.space[1],
    },
    // Figures in the mono face with tabular digits, so the terms line up digit under digit.
    number: { ...theme.typography.figure, color: theme.colors.ink, fontVariant: ['tabular-nums' as const] },
    mismatch: { color: theme.colors.status.danger.ink },
  };
}
