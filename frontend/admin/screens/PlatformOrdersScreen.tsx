import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { ChipRow, QueryState, ScreenScaffold, TextField, type ChipOption } from '../../common/components';
import { OrderCard, type OrderStatus } from '../../common/orders';
import { ADMIN_HOME_ROUTES } from '../../common/constants/routes';
import { statusMeta } from '../../common/constants/status';
import type { AdminScreenProps } from '../../navigation/stacks/AdminNavigator';
import { LoadMore } from '../components/LoadMore';
import { useOrderPages } from '../hooks/admin';

type Filter = OrderStatus | 'all';

const FILTER_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'dispatched', 'completed', 'disputed', 'cancelled'];
const FILTERS: ChipOption<Filter>[] = [
  { value: 'all', label: 'All' },
  ...FILTER_STATUSES.map(status => ({ value: status, label: statusMeta('order', status).label })),
];

/**
 * Platform-wide order overview: every order, not scoped to a buyer or seller. The Overview's "Disputes" tile opens it
 * filtered to disputed orders, and that filter runs in the database (/admin/orders?status=disputed), so no disputed order
 * is missed past the first page. The API filters on nothing else, so the search and the other status chips look through
 * the pages already loaded.
 */
export function PlatformOrdersScreen({ route }: Partial<AdminScreenProps<typeof ADMIN_HOME_ROUTES.Orders>>) {
  const navigation = useNavigation<AdminScreenProps<typeof ADMIN_HOME_ROUTES.Orders>['navigation']>();
  const requested = route?.params?.status;
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>(requested ?? 'all');

  // A tile pressed while this screen is open brings a new param; the filter follows it (adjusted during render, not in
  // an effect, so the list never draws once with the old filter).
  const [seenRequest, setSeenRequest] = useState(requested);
  if (requested !== seenRequest) {
    setSeenRequest(requested);
    if (requested) setFilter(requested);
  }

  const needle = search.trim().toLowerCase();
  const serverStatus = filter === 'disputed' ? 'disputed' : undefined;
  const query = useOrderPages(serverStatus, needle.length > 0 || (filter !== 'all' && serverStatus === undefined));
  const { rows, refetch } = query;

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const shown = rows.filter(order => {
    if (filter !== 'all' && order.status !== filter) return false;
    if (!needle) return true;
    const haystack = [order.buyer?.full_name, order.seller?.full_name, ...order.order_items.map(item => item.listing?.title)].join(' ').toLowerCase();
    return haystack.includes(needle);
  });

  return (
    <ScreenScaffold onRefresh={() => refetch()} refreshing={query.isRefetching && !query.isFetchingNextPage}>
      <TextField label="Find an order" placeholder="Buyer, seller or item" value={search} onChangeText={setSearch} autoCorrect={false} />
      <ChipRow options={FILTERS} value={filter} onChange={setFilter} />
      <QueryState
        query={query}
        failureTitle="Couldn't load orders"
        isEmpty={shown.length === 0 && !query.hasNextPage && !query.isFetching}
        empty={
          needle || filter !== 'all'
            ? { title: 'No order matches', description: 'Try a different name, item or status.' }
            : { title: 'No orders yet', description: 'Platform orders show up here once they are placed.' }
        }
      >
        {shown.map(order => (
          <OrderCard
            key={order.id}
            order={order}
            counterpartyName={`${order.buyer?.full_name || 'Unknown buyer'} → ${order.seller?.full_name || 'Unknown seller'}`}
            onPress={() => navigation.navigate(ADMIN_HOME_ROUTES.OrderDetail, { orderId: order.id })}
          />
        ))}
        <LoadMore
          hasMore={!!query.hasNextPage}
          loading={query.isFetchingNextPage}
          onLoadMore={() => query.fetchNextPage()}
          noun="orders"
        />
      </QueryState>
    </ScreenScaffold>
  );
}

