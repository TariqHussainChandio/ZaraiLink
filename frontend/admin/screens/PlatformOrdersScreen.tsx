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

/** Platform-wide order overview: every order, not scoped to a buyer or seller. The API pages it and offers no filter, so the
 * search and the status chips look through the pages already loaded. */
export function PlatformOrdersScreen() {
  const navigation = useNavigation<AdminScreenProps<'Orders'>['navigation']>();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const needle = search.trim().toLowerCase();
  const query = useOrderPages(needle.length > 0 || filter !== 'all');
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

