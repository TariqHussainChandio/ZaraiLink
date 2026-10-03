import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { ChipRow, type ChipOption, EmptyState, SkeletonList, StaggeredItem } from '../../components';
import { OrderCard } from '../components/OrderCard';
import { ORDERS_ROUTES } from '../../constants/routes';
import { useOrders } from '../hooks/orders';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';
import type { OrdersScreenProps } from '../../../navigation/stacks/OrdersNavigator';

type Segment = 'buyer' | 'seller';

const SEGMENTS: ChipOption<Segment>[] = [
  { value: 'buyer', label: 'Purchases' },
  { value: 'seller', label: 'Sales' },
];

export function OrderHistoryScreen({ navigation }: OrdersScreenProps<'OrderHistory'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const role = useAuthStore(state => state.role);
  const [segment, setSegment] = useState<Segment>(
    role === 'farmer' || role === 'dealer' ? 'seller' : 'buyer',
  );

  const { data: orders = [], isLoading: loading, refetch } = useOrders(segment, !!userId);

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  return (
    <View style={styles.container}>
      <View style={styles.segments}>
        <ChipRow options={SEGMENTS} value={segment} onChange={setSegment} />
      </View>

      {loading ? (
        <SkeletonList />
      ) : (
        <FlashList
          data={orders}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => (
            <StaggeredItem index={index}>
              <OrderCard
                order={item}
                counterpartyName={
                  (segment === 'buyer' ? item.seller?.full_name : item.buyer?.full_name) ||
                  'Unknown'
                }
                onPress={() => navigation.navigate(ORDERS_ROUTES.OrderDetail, { orderId: item.id })}
              />
            </StaggeredItem>
          )}
          ListEmptyComponent={
            <EmptyState
              title={segment === 'buyer' ? 'No purchases yet' : 'No sales yet'}
              description="Orders will show up here once they're placed."
            />
          }
        />
      )}
    </View>
  );
}

function makeStyles({ colors, space }: Theme) {
  return StyleSheet.create({
    segments: {
      paddingHorizontal: space[4],
      paddingTop: space[3],
    },
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    list: {
      paddingHorizontal: space[4],
    },
  });
}
