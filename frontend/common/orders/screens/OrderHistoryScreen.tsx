import { useFocusEffect } from '@react-navigation/native';
import { ClipboardList } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { ChipRow, type ChipOption, QueryState, ScreenScaffold } from '../../components';
import { OrderCard } from '../components/OrderCard';
import { APP_TABS, MARKETPLACE_ROUTES, ORDERS_ROUTES } from '../../constants/routes';
import { useOrders } from '../hooks/orders';
import type { OrderStatus } from '../types/orders';
import { useAuthStore } from '../../../state/authStore';
import { navigateInTab } from '../../../navigation/navigateInTab';
import { useAppTabNavigation } from '../../../navigation/stacks/useAppTabNavigation';
import { useTheme, type Theme } from '../../../theme';
import type { OrdersScreenProps } from '../../../navigation/stacks/OrdersNavigator';

type Segment = 'buyer' | 'seller';
type Bucket = 'open' | 'completed' | 'cancelled';

const SEGMENTS: ChipOption<Segment>[] = [
  { value: 'buyer', label: 'Purchases' },
  { value: 'seller', label: 'Sales' },
];

const BUCKETS: ChipOption<Bucket>[] = [
  { value: 'open', label: 'Open' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

// Which list an order belongs in. Open is everything still moving, and a dispute is still unsettled; Cancelled is every
// way an order ended without goods changing hands.
const BUCKET_OF: Record<OrderStatus, Bucket> = {
  pending: 'open',
  confirmed: 'open',
  processing: 'open',
  ready: 'open',
  dispatched: 'open',
  disputed: 'open',
  completed: 'completed',
  refunded: 'completed',
  cancelled: 'cancelled',
  rejected: 'cancelled',
  expired: 'cancelled',
  payment_failed: 'cancelled',
};

const EMPTY_TITLE: Record<Segment, Record<Bucket, string>> = {
  buyer: { open: 'No open orders', completed: 'No completed orders yet', cancelled: 'No cancelled orders' },
  seller: { open: 'No open sales', completed: 'No completed sales yet', cancelled: 'No cancelled sales' },
};

export function OrderHistoryScreen({ navigation }: OrdersScreenProps<'OrderHistory'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const role = useAuthStore(state => state.role);
  const tabs = useAppTabNavigation();
  // Only sellers have sales; a buyer's second chip row was always empty (MK-20).
  const sells = role === 'farmer' || role === 'dealer';
  const [segment, setSegment] = useState<Segment>(sells ? 'seller' : 'buyer');
  const [bucket, setBucket] = useState<Bucket>('open');

  const query = useOrders(segment, !!userId);
  const { refetch } = query;
  const orders = useMemo(() => (query.data ?? []).filter(order => BUCKET_OF[order.status] === bucket), [query.data, bucket]);

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  return (
    <ScreenScaffold scroll={false} contentStyle={styles.column}>
      {sells ? <ChipRow options={SEGMENTS} value={segment} onChange={setSegment} /> : null}
      <ChipRow options={BUCKETS} value={bucket} onChange={setBucket} />
      <View style={styles.results}>
        <QueryState
          query={query}
          failureTitle="Couldn't load your orders"
          isEmpty={orders.length === 0}
          empty={{
            title: EMPTY_TITLE[segment][bucket],
            description:
              segment === 'buyer' ? 'Orders you place appear here.' : 'Orders from buyers appear here as soon as they are placed.',
            icon: ClipboardList,
            ...(segment === 'buyer' && bucket === 'open'
              ? { actionLabel: 'Browse the market', onAction: () => navigateInTab(tabs, APP_TABS.Marketplace, MARKETPLACE_ROUTES.Browse) }
              : {}),
          }}
        >
          <FlashList
            data={orders}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={Gap}
            renderItem={({ item }) => (
              <OrderCard
                order={item}
                counterpartyName={(segment === 'buyer' ? item.seller?.full_name : item.buyer?.full_name) || 'Not named'}
                onPress={() => navigation.navigate(ORDERS_ROUTES.OrderDetail, { orderId: item.id })}
              />
            )}
          />
        </QueryState>
      </View>
    </ScreenScaffold>
  );
}

function Gap() {
  const { space } = useTheme();
  return <View style={{ height: space[3] }} />;
}

function makeStyles({ space }: Theme) {
  return StyleSheet.create({
    column: { gap: 0 },
    results: { flex: 1 },
    list: { paddingBottom: space[6] },
  });
}
