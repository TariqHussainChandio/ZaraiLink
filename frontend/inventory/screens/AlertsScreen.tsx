import { FlashList } from '@shopify/flash-list';
import { CircleCheck, Settings } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { RefreshControl, View } from 'react-native';
import { Button, EmptyState, ListRow, ScreenState, StatusBadge } from '../../common/components';
import { type Theme, useTheme } from '../../theme';
import { formatQuantity } from '../components/format';
import { makeScreenStyles } from '../components/screenStyles';
import { useStockAlerts } from '../hooks/inventory';
import { useLookups } from '../hooks/lookups';
import { INVENTORY_ROUTES, type InventoryScreenProps } from '../types/navigation';

/** The alert centre (SRDS §24): every product that is out of stock or at or under its reorder level. */
export function AlertsScreen({ navigation }: InventoryScreenProps<typeof INVENTORY_ROUTES.Alerts>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const result = useStockAlerts();
  const { data, refetch, isRefetching } = result;
  const { locationById } = useLookups();

  // Out of stock first: it is the one that loses a sale today.
  const alerts = useMemo(
    () => [...(data ?? [])].sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'out_of_stock' ? -1 : 1)),
    [data],
  );

  if (!data) {
    return (
      <View style={styles.screen}>
        <ScreenState query={result} errorTitle="Couldn't load the alerts" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlashList
        data={alerts}
        keyExtractor={alert => `${alert.product_id}-${alert.location_id ?? 'all'}`}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Button
              label="Alert settings"
              icon={Settings}
              variant="quiet"
              size="sm"
              onPress={() => navigation.navigate(INVENTORY_ROUTES.AlertSettings)}
            />
          </View>
        }
        renderItem={({ item: alert }) => (
          <ListRow
            title={alert.name}
            meta={[
              alert.sku,
              alert.location_id ? locationById.get(alert.location_id)?.name : null,
              `${formatQuantity(alert.quantity, alert.unit)} left`,
              `reorder at ${formatQuantity(alert.reorder_threshold)}`,
            ]
              .filter(Boolean)
              .join(' · ')}
            trailing={<StatusBadge kind="stock" status={alert.status} size="sm" />}
            onPress={() => navigation.navigate(INVENTORY_ROUTES.ProductDetail, { productId: alert.product_id })}
          />
        )}
        ListEmptyComponent={
          <EmptyState icon={CircleCheck} title="No stock alerts" description="Every product is above its reorder level." />
        }
      />
    </View>
  );
}

function makeStyles(theme: Theme) {
  return {
    ...makeScreenStyles(theme),
    list: { padding: theme.space[4], paddingBottom: theme.space[12] },
    header: { alignItems: 'flex-end' as const, marginBottom: theme.space[2] },
  };
}
