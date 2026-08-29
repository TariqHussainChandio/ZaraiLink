import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { EmptyState, Spinner } from '../../components/ui';
import { OrderCard } from '../../components/features/orders/OrderCard';
import { ORDERS_ROUTES } from '../../constants/routes';
import { fetchOrdersForUser } from '../../services/modules/orders/ordersService';
import { useAuthStore } from '../../store/authStore';
import { lightTheme } from '../../theme';
import type { OrdersScreenProps } from '../../navigation/stacks/OrdersNavigator';

type Segment = 'buyer' | 'seller';

const { colors, spacing, typography } = lightTheme;

export function OrderHistoryScreen({ navigation }: OrdersScreenProps<'OrderHistory'>) {
  const userId = useAuthStore(state => state.user?.id);
  const role = useAuthStore(state => state.role);
  const [segment, setSegment] = useState<Segment>(
    role === 'farmer' || role === 'dealer' ? 'seller' : 'buyer',
  );

  const { data: orders = [], isLoading: loading, refetch } = useQuery({
    queryKey: ['orders', segment],
    queryFn: () => fetchOrdersForUser(segment),
    enabled: !!userId,
  });

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  return (
    <View style={styles.container}>
      <View style={styles.segmentRow}>
        {(['buyer', 'seller'] as Segment[]).map(value => (
          <TouchableOpacity
            key={value}
            style={[styles.segment, segment === value && styles.segmentActive]}
            onPress={() => setSegment(value)}
          >
            <Text style={[styles.segmentLabel, segment === value && styles.segmentLabelActive]}>
              {value === 'buyer' ? 'Purchases' : 'Sales'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <Spinner fullscreen />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <OrderCard
              order={item}
              counterpartyName={
                (segment === 'buyer' ? item.seller?.full_name : item.buyer?.full_name) ?? 'Unknown'
              }
              onPress={() => navigation.navigate(ORDERS_ROUTES.OrderDetail, { orderId: item.id })}
            />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
  },
  segmentRow: {
    flexDirection: 'row',
    margin: spacing.lg,
    backgroundColor: colors.neutral.gray100,
    borderRadius: lightTheme.radii.md,
    padding: spacing.xs / 2,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: lightTheme.radii.sm,
  },
  segmentActive: {
    backgroundColor: colors.neutral.white,
  },
  segmentLabel: {
    fontSize: typography.sizes.sm,
    color: colors.neutral.gray500,
    fontWeight: typography.weights.medium as any,
  },
  segmentLabelActive: {
    color: colors.brand.primary,
    fontWeight: typography.weights.semibold as any,
  },
  list: {
    paddingHorizontal: spacing.lg,
  },
});
