import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Receipt } from 'lucide-react-native';
import { ChipRow, ScreenState } from '../../common/components';
import { OrderCard } from '../../common/orders';
import { ADMIN_HOME_ROUTES } from '../../common/constants/routes';
import { useAllOrders } from '../hooks/admin';
import type { AdminScreenProps } from '../../navigation/stacks/AdminNavigator';
import { useTheme, type Theme } from '../../theme';

type OrderFilter = 'all' | 'disputed';

const FILTERS: { value: OrderFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'disputed', label: 'Disputed' },
];

/**
 * Platform-wide order overview — every order, not scoped to a buyer/seller segment. The Overview's "Disputes" tile opens
 * it filtered to disputed orders. The filter runs in the database (/admin/orders?status=), so no disputed order is missed.
 */
export function PlatformOrdersScreen({ route }: Partial<AdminScreenProps<typeof ADMIN_HOME_ROUTES.Orders>>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const navigation = useNavigation<AdminScreenProps<typeof ADMIN_HOME_ROUTES.Orders>['navigation']>();
  const requested = route?.params?.status;
  const [filter, setFilter] = useState<OrderFilter>(requested ?? 'all');
  const orders = useAllOrders(filter === 'all' ? undefined : filter);
  const { refetch } = orders;

  // A tile pressed while this screen is open brings a new param; the filter follows it (adjusted during render, not in
  // an effect, so the list never draws once with the old filter).
  const [seenRequest, setSeenRequest] = useState(requested);
  if (requested !== seenRequest) {
    setSeenRequest(requested);
    if (requested) setFilter(requested);
  }

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  return (
    <View style={styles.container}>
      <ChipRow options={FILTERS} value={filter} onChange={setFilter} />
      <ScreenState
        query={orders}
        errorTitle="Couldn't load the orders"
        empty={{
          title: filter === 'disputed' ? 'No disputed orders' : 'No orders yet',
          description: filter === 'disputed' ? undefined : 'Platform orders will show up here once placed.',
          icon: Receipt,
        }}
      >
        {data => (
          <FlashList
            data={data}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <OrderCard
                order={item}
                counterpartyName={`${item.buyer?.full_name || 'Unknown buyer'} → ${item.seller?.full_name || 'Unknown seller'}`}
                onPress={() => navigation.navigate(ADMIN_HOME_ROUTES.OrderDetail, { orderId: item.id })}
              />
            )}
          />
        )}
      </ScreenState>
    </View>
  );
}

function makeStyles({ colors, space }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
      paddingTop: space[3],
    },
    list: {
      paddingHorizontal: space[4],
      paddingTop: space[4],
    },
  });
}
