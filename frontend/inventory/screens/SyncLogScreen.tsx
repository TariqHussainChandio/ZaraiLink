import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { ExternalLink, Receipt, RefreshCw } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, Text, View } from 'react-native';
import { Button, Card, EmptyState, ListGroup, ListRow, ScreenState, Sheet, StatusBadge, useToast } from '../../common/components';
import { APP_TABS, ORDERS_ROUTES } from '../../common/constants/routes';
import { useOrders } from '../../common/orders';
import type { MarketRootParamList } from '../../navigation/stacks/AppNavigator';
import { type Theme, useTheme } from '../../theme';
import { formatDateTime, formatMoney, formatQuantity } from '../components/format';
import { makeScreenStyles } from '../components/screenStyles';
import { inventoryErrorMessage } from '../hooks/errors';
import { useListingOptions, useRetrySync, useSyncLog } from '../hooks/inventory';
import type { SyncLogEntry } from '../types/inventory';
import type { INVENTORY_ROUTES, InventoryScreenProps } from '../types/navigation';

/** The first block of a uuid, upper case, as the dealer reads an order number aloud: "Order 3F2A9C1B". */
function shortOrderId(orderId: string): string {
  return orderId.split('-')[0]?.toUpperCase() ?? orderId;
}

/**
 * B3: each marketplace dispatch that reached this dealer's inventory, and a way to re-run the ones that failed. Each
 * line names its listing and order (B3 verification N5). "View order" shows the order in a sheet inside the inventory
 * system, so Back returns to this log (B4 verification F5); the full order screen is the marketplace's, offered from the
 * sheet as a way out of the inventory system, not as the default.
 */
export function SyncLogScreen(_props: InventoryScreenProps<typeof INVENTORY_ROUTES.SyncLog>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const result = useSyncLog();
  const { data, refetch, isRefetching } = result;
  // The log carries ids; the dealer's own listings (the product link's choices) give each line its listing's title.
  const listings = useListingOptions(true);
  const titleById = useMemo(
    () => new Map((listings.data ?? []).map(listing => [listing.id, listing.title])),
    [listings.data],
  );
  const rootNavigation = useNavigation<NavigationProp<MarketRootParamList>>();
  const [viewing, setViewing] = useState<string | null>(null);
  // The dealer's sales through the orders module's public hook, read only while a sheet is open.
  const sales = useOrders('seller', viewing !== null);
  const order = viewing ? sales.data?.find(item => item.id === viewing) : undefined;
  const retry = useRetrySync();
  const toast = useToast();
  const failedCount = (data ?? []).filter(entry => entry.status === 'failed').length;

  // A dispatch can land while the dealer is elsewhere in the app; coming back shows it.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const onRetry = async () => {
    try {
      const { applied } = await retry.mutateAsync();
      toast.success(applied === 1 ? '1 dispatch applied to your stock' : `${applied} dispatches applied to your stock`);
    } catch (err) {
      toast.error(inventoryErrorMessage(err));
    }
  };

  // The order lives in the marketplace's Orders tab: this leaves the inventory system for it (navigate is handed up to
  // the root stack, which holds the tabs).
  const openOrder = (orderId: string) => {
    setViewing(null);
    rootNavigation.navigate('Tabs', {
      screen: APP_TABS.Orders,
      params: { screen: ORDERS_ROUTES.OrderDetail, params: { orderId }, initial: false },
    });
  };

  const renderEntry = ({ item: entry }: { item: SyncLogEntry }) => {
    const orderId = entry.order_id;
    const listingTitle = entry.listing_id ? (titleById.get(entry.listing_id) ?? 'A listing no longer yours') : null;
    return (
      <Card style={styles.card}>
        <View style={styles.line}>
          <StatusBadge kind="sync" status={entry.status} />
          <Text style={styles.caption}>{entry.attempts === 1 ? '1 attempt' : `${entry.attempts} attempts`}</Text>
        </View>
        {listingTitle ? <Text style={styles.title}>{listingTitle}</Text> : null}
        <Text style={styles.caption}>
          {[orderId ? `Order ${shortOrderId(orderId)}` : null, formatDateTime(entry.processed_at)]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {entry.status === 'failed' && entry.error ? <Text style={styles.error}>{entry.error}</Text> : null}
        {orderId ? (
          <Button
            label="View order"
            icon={Receipt}
            variant="quiet"
            size="sm"
            fullWidth={false}
            accessibilityLabel={`View order ${shortOrderId(orderId)}`}
            onPress={() => setViewing(orderId)}
          />
        ) : null}
      </Card>
    );
  };

  return (
    <View style={styles.screen}>
      <FlashList
        data={data ?? []}
        keyExtractor={entry => entry.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
        ListHeaderComponent={
          <View style={styles.header}>
            {failedCount > 0 ? (
              <Button label={`Retry failed (${failedCount})`} icon={RefreshCw} loading={retry.isPending} onPress={onRetry} />
            ) : null}
          </View>
        }
        renderItem={renderEntry}
        ListEmptyComponent={
          data ? (
            <EmptyState
              icon={RefreshCw}
              title="No marketplace dispatches yet"
              description="When you dispatch a marketplace order, its stock change shows here."
            />
          ) : (
            <ScreenState query={result} errorTitle="Couldn't load marketplace sync" />
          )
        }
      />
      <Sheet
        visible={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing ? `Order ${shortOrderId(viewing)}` : undefined}
      >
        <View style={styles.sheet}>
          {order ? (
            <>
              <View style={styles.line}>
                <Text style={styles.title}>{order.buyer?.full_name ?? 'Buyer'}</Text>
                <StatusBadge kind="order" status={order.status} />
              </View>
              <Text style={styles.caption}>{`Placed ${formatDateTime(order.created_at)} · ${formatMoney(order.total)}`}</Text>
              <ListGroup>
                {order.order_items.map(item => (
                  <ListRow
                    key={item.id}
                    title={item.listing?.title ?? 'Listing'}
                    trailing={<Text style={styles.figure}>{formatQuantity(item.quantity, item.listing?.unit)}</Text>}
                  />
                ))}
              </ListGroup>
            </>
          ) : sales.isPending ? (
            <Text style={styles.caption}>Loading the order</Text>
          ) : (
            <Text style={styles.caption}>
              {sales.isError ? "Couldn't load the order." : 'This order is not among your recent sales.'}
            </Text>
          )}
          {viewing ? (
            <Button
              label="Open in ZaraiLink Orders"
              icon={ExternalLink}
              variant="secondary"
              accessibilityLabel={`Open order ${shortOrderId(viewing)} in ZaraiLink Orders, leaving the inventory system`}
              onPress={() => openOrder(viewing)}
            />
          ) : null}
        </View>
      </Sheet>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return {
    ...makeScreenStyles(theme),
    list: { padding: theme.space[4], paddingBottom: theme.space[12] },
    header: { gap: theme.space[3], marginBottom: theme.space[3] },
    card: { gap: theme.space[1], marginBottom: theme.space[3] },
    line: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const },
    title: { ...theme.typography.bodyStrong, color: theme.colors.ink },
    error: { ...theme.typography.caption, color: theme.colors.status.danger.ink },
    sheet: { gap: theme.space[3] },
  };
}
