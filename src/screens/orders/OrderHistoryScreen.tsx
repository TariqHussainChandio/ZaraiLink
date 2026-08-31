import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { EmptyState, SkeletonList, StaggeredItem } from '../../components/ui';
import { OrderCard } from '../../components/features/orders/OrderCard';
import { ORDERS_ROUTES } from '../../constants/routes';
import { fetchOrdersForUser } from '../../services/modules/orders/ordersService';
import { useAuthStore } from '../../store/authStore';
import { useTheme, type Theme } from '../../theme';
import type { OrdersScreenProps } from '../../navigation/stacks/OrdersNavigator';

type Segment = 'buyer' | 'seller';

export function OrderHistoryScreen({ navigation }: OrdersScreenProps<'OrderHistory'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
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
        <SkeletonList />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => (
            <StaggeredItem index={index}>
              <OrderCard
                order={item}
                counterpartyName={
                  (segment === 'buyer' ? item.seller?.full_name : item.buyer?.full_name) ?? 'Unknown'
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

function makeStyles({ colors, spacing, radii, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.surface,
    },
    segmentRow: {
      flexDirection: 'row',
      margin: spacing.lg,
      backgroundColor: colors.background.default,
      borderRadius: radii.md,
      padding: spacing.xs / 2,
    },
    segment: {
      flex: 1,
      paddingVertical: spacing.sm,
      alignItems: 'center',
      borderRadius: radii.sm,
    },
    segmentActive: {
      backgroundColor: colors.background.surface,
    },
    segmentLabel: {
      fontSize: typography.sizes.sm,
      color: colors.text.secondary,
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
}
