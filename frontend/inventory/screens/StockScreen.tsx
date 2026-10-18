import { FlashList } from '@shopify/flash-list';
import { Boxes, MapPin } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { RefreshControl, Text, View } from 'react-native';
import { EmptyState, ListRow, ScreenState, StatusBadge } from '../../common/components';
import { QuickActions } from '../../common/components/dashboards/QuickActions';
import { type Theme, useTheme } from '../../theme';
import { formatQuantity, stockStatus } from '../components/format';
import { makeScreenStyles } from '../components/screenStyles';
import { Section } from '../components/Section';
import { useLocations, useStock } from '../hooks/inventory';
import { useSelectedLocation } from '../hooks/location';
import { useLookups } from '../hooks/lookups';
import type { StockOperation } from '../types/inventory';
import { INVENTORY_ROUTES, type InventoryScreenProps } from '../types/navigation';

/** The stock at the location chosen in the app bar, and the four operations that change it (SRDS §22–§23). */
export function StockScreen({ navigation }: InventoryScreenProps<typeof INVENTORY_ROUTES.Stock>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { location } = useSelectedLocation();
  const locations = useLocations();
  const result = useStock(location?.id ?? null);
  const { data, refetch, isRefetching } = result;
  const { productById } = useLookups();

  const rows = useMemo(
    () =>
      (data ?? [])
        .map(level => ({ level, product: productById.get(level.product_id) }))
        .sort((a, b) => (a.product?.name ?? '').localeCompare(b.product?.name ?? '')),
    [data, productById],
  );

  const operate = (operation: StockOperation) => navigation.navigate(INVENTORY_ROUTES.Operation, { operation });

  // Stock is kept per location, so with none chosen there is nothing to read: the stock query stays disabled, and
  // without this the screen would show its skeleton for ever.
  if (!location) {
    return (
      <View style={styles.screen}>
        {locations.data === undefined ? (
          <ScreenState query={locations} errorTitle="Couldn't load your locations" />
        ) : (
          <EmptyState
            icon={MapPin}
            title="No location yet"
            description="Stock is kept per location. Add your shop or godown first."
            actionLabel="Add location"
            onAction={() => navigation.navigate(INVENTORY_ROUTES.LocationForm, {})}
          />
        )}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlashList
        data={data ? rows : []}
        keyExtractor={row => `${row.level.product_id}-${row.level.location_id}`}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Section title="Operations">
              <QuickActions
                actions={[
                  { label: 'Stock in', onPress: () => operate('in') },
                  { label: 'Stock out', onPress: () => operate('out') },
                  { label: 'Adjust', onPress: () => operate('adjust') },
                  { label: 'Transfer', onPress: () => operate('transfer') },
                ]}
              />
            </Section>
            <Text style={styles.overline}>{location ? `Stock at ${location.name}` : 'Stock'}</Text>
          </View>
        }
        renderItem={({ item: { level, product } }) => (
          <ListRow
            title={product?.name ?? 'Product'}
            meta={product ? product.sku : undefined}
            trailing={
              <View style={styles.end}>
                <Text style={styles.figure}>{formatQuantity(level.quantity, product?.unit)}</Text>
                <StatusBadge
                  kind="stock"
                  status={stockStatus(level.quantity, product?.reorder_threshold ?? 0)}
                  size="sm"
                />
              </View>
            }
            onPress={() => navigation.navigate(INVENTORY_ROUTES.ProductDetail, { productId: level.product_id })}
          />
        )}
        ListEmptyComponent={
          data ? (
            <EmptyState
              icon={Boxes}
              title="Nothing stocked here yet"
              description="Record a Stock In or receive a purchase into this location."
            />
          ) : (
            <ScreenState query={result} errorTitle="Couldn't load the stock" />
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
    header: { gap: theme.space[4], marginBottom: theme.space[2] },
    end: { alignItems: 'flex-end' as const, gap: theme.space[1] },
  };
}
