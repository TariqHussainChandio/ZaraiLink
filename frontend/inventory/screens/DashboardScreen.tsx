import { useFocusEffect } from '@react-navigation/native';
import { Ban, Boxes, Package, RefreshCw, TriangleAlert, Wallet } from 'lucide-react-native';
import React, { useCallback, useMemo } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { Button, Card, ListGroup, ListRow, ScreenState, StatusBadge, useToast } from '../../common/components';
import { BarChart } from '../../common/components/dashboards/BarChart';
import { QuickActions } from '../../common/components/dashboards/QuickActions';
import { StatTile } from '../../common/components/dashboards/StatTile';
import { type Theme, useRoleAccent, useTheme } from '../../theme';
import { formatDate, formatDay, formatMoney, formatQuantity } from '../components/format';
import { MovementRow } from '../components/MovementRow';
import { makeScreenStyles } from '../components/screenStyles';
import { Section } from '../components/Section';
import { inventoryErrorMessage } from '../hooks/errors';
import { useInventoryDashboard, useRetrySync, useSyncLog } from '../hooks/inventory';
import { useLookups } from '../hooks/lookups';
import type { Movement } from '../types/inventory';
import { INVENTORY_ROUTES, type InventoryScreenProps } from '../types/navigation';

/** SRDS §18: the dealer's stock at a glance — totals, the 30-day trend, recent activity, alerts and marketplace sync. */
export function DashboardScreen({ navigation }: InventoryScreenProps<typeof INVENTORY_ROUTES.Dashboard>) {
  const theme = useTheme();
  const accent = useRoleAccent();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const result = useInventoryDashboard();
  const { data, refetch, isRefetching } = result;
  const syncLog = useSyncLog();
  const retry = useRetrySync();
  const { productById, locationById } = useLookups();
  const toast = useToast();

  // A marketplace dispatch can change stock while the dealer is elsewhere; coming back shows it.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const trend = useMemo(() => data?.trend ?? [], [data]);
  // A month with nothing moving is shown as the chart's empty message, not thirty empty bars.
  const inData = useMemo(
    () => (trend.some(point => point.in > 0) ? trend.map(point => ({ label: formatDay(point.date), value: point.in })) : []),
    [trend],
  );
  const outData = useMemo(
    () => (trend.some(point => point.out > 0) ? trend.map(point => ({ label: formatDay(point.date), value: point.out })) : []),
    [trend],
  );

  const onRetry = async () => {
    try {
      const { applied } = await retry.mutateAsync();
      toast.success(applied === 1 ? '1 dispatch applied to your stock' : `${applied} dispatches applied to your stock`);
    } catch (err) {
      toast.error(inventoryErrorMessage(err));
    }
  };

  const renderMovement = (movement: Movement) => (
    <MovementRow
      key={movement.id}
      movement={movement}
      productName={productById.get(movement.product_id)?.name}
      locationName={locationById.get(movement.location_id)?.name}
    />
  );

  if (!data) {
    return (
      <View style={styles.screen}>
        <ScreenState query={result} errorTitle="Couldn't load your inventory" />
      </View>
    );
  }

  const { totals } = data;
  const recentSync = (syncLog.data ?? []).slice(0, 3);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
    >
      <View style={styles.tiles}>
        <StatTile label="Products" value={totals.products} icon={Package} />
        <StatTile label="Stock units" value={formatQuantity(totals.stock_units)} icon={Boxes} />
        <StatTile
          label="Low stock"
          value={totals.low_stock}
          icon={TriangleAlert}
          accent={theme.colors.status.warning.mark}
        />
        <StatTile label="Out of stock" value={totals.out_of_stock} icon={Ban} accent={theme.colors.status.danger.mark} />
        <StatTile label="Stock value at cost" value={formatMoney(totals.inventory_value)} icon={Wallet} />
      </View>

      <QuickActions
        actions={[
          { label: 'Stock in', onPress: () => navigation.navigate(INVENTORY_ROUTES.Operation, { operation: 'in' }) },
          { label: 'Stock out', onPress: () => navigation.navigate(INVENTORY_ROUTES.Operation, { operation: 'out' }) },
          { label: 'Adjust', onPress: () => navigation.navigate(INVENTORY_ROUTES.Operation, { operation: 'adjust' }) },
          {
            label: 'Transfer',
            onPress: () => navigation.navigate(INVENTORY_ROUTES.Operation, { operation: 'transfer' }),
          },
        ]}
      />

      <Section title="Last 30 days">
        <Card>
          <Text style={styles.overline}>Stock in</Text>
          <BarChart data={inData} color={theme.colors.status.success.mark} emptyMessage="No stock came in" />
          <Text style={styles.overline}>Stock out</Text>
          <BarChart data={outData} color={accent.mark} emptyMessage="No stock went out" />
        </Card>
      </Section>

      <Section
        title="Alerts"
        actionLabel={data.alerts.length > 0 ? 'See all' : undefined}
        onAction={() => navigation.navigate(INVENTORY_ROUTES.Alerts)}
      >
        {data.alerts.length === 0 ? (
          <Text style={styles.caption}>Every product is above its reorder level.</Text>
        ) : (
          <ListGroup>
            {data.alerts.slice(0, 5).map(alert => (
              <ListRow
                key={`${alert.product_id}-${alert.location_id ?? 'all'}`}
                title={alert.name}
                meta={`${formatQuantity(alert.quantity, alert.unit)} · reorder at ${formatQuantity(alert.reorder_threshold)}`}
                trailing={<StatusBadge kind="stock" status={alert.status} size="sm" />}
                onPress={() => navigation.navigate(INVENTORY_ROUTES.ProductDetail, { productId: alert.product_id })}
              />
            ))}
          </ListGroup>
        )}
      </Section>

      <Section title="Recent movements" onAction={() => navigation.navigate(INVENTORY_ROUTES.Movements)} actionLabel="History">
        {data.recent_movements.length === 0 ? (
          <Text style={styles.caption}>No stock has moved yet.</Text>
        ) : (
          <ListGroup>{data.recent_movements.map(renderMovement)}</ListGroup>
        )}
      </Section>

      <Section title="Recent adjustments">
        {data.recent_adjustments.length === 0 ? (
          <Text style={styles.caption}>No adjustments recorded.</Text>
        ) : (
          <ListGroup>{data.recent_adjustments.map(renderMovement)}</ListGroup>
        )}
      </Section>

      <Section title="Recent restocks">
        {data.recent_restocks.length === 0 ? (
          <Text style={styles.caption}>No restocks recorded.</Text>
        ) : (
          <ListGroup>{data.recent_restocks.map(renderMovement)}</ListGroup>
        )}
      </Section>

      <Section
        title="Recent purchases"
        actionLabel="All purchases"
        onAction={() => navigation.navigate(INVENTORY_ROUTES.Purchases)}
      >
        {data.recent_purchases.length === 0 ? (
          <Text style={styles.caption}>No purchases recorded.</Text>
        ) : (
          <ListGroup>
            {data.recent_purchases.map(purchase => (
              <ListRow
                key={purchase.id}
                title={purchase.reference || 'Purchase'}
                meta={formatDate(purchase.purchased_on)}
                trailing={<StatusBadge kind="purchase" status={purchase.status} size="sm" />}
                onPress={() => navigation.navigate(INVENTORY_ROUTES.PurchaseDetail, { purchaseId: purchase.id })}
              />
            ))}
          </ListGroup>
        )}
      </Section>

      <Section title="Marketplace sync" actionLabel="Sync log" onAction={() => navigation.navigate(INVENTORY_ROUTES.SyncLog)}>
        <Card style={styles.actions}>
          <Text style={styles.body}>
            {data.sync_failures === 0
              ? 'Every marketplace dispatch has reached your stock.'
              : data.sync_failures === 1
                ? '1 marketplace dispatch could not be applied to your stock.'
                : `${data.sync_failures} marketplace dispatches could not be applied to your stock.`}
          </Text>
          {recentSync.map(entry => (
            <View key={entry.id} style={styles.row}>
              <StatusBadge kind="sync" status={entry.status} size="sm" />
              <Text style={styles.caption}>{formatDate(entry.processed_at)}</Text>
            </View>
          ))}
          {data.sync_failures > 0 ? (
            <Button label="Retry failed dispatches" icon={RefreshCw} variant="secondary" loading={retry.isPending} onPress={onRetry} />
          ) : null}
        </Card>
      </Section>
    </ScrollView>
  );
}

function makeStyles(theme: Theme) {
  return makeScreenStyles(theme);
}
