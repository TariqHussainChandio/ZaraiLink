import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { EmptyState, Spinner } from '../../components/ui';
import { OrderCard } from '../../components/features/orders/OrderCard';
import { fetchAllOrders } from '../../services/modules/admin/adminService';
import { lightTheme } from '../../theme';
import type { OrderWithItems } from '../../types/orders';

const { colors, spacing } = lightTheme;

/** Platform-wide order overview — every order, not scoped to a buyer/seller segment. */
export function PlatformOrdersScreen() {
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setOrders(await fetchAllOrders());
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading) return <Spinner fullscreen />;

  return (
    <View style={styles.container}>
      <FlatList
        data={orders}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <OrderCard
            order={item}
            counterpartyName={`${item.buyer?.full_name ?? 'Unknown buyer'} → ${item.seller?.full_name ?? 'Unknown seller'}`}
            onPress={() => {}}
          />
        )}
        ListEmptyComponent={
          <EmptyState title="No orders yet" description="Platform orders will show up here once placed." />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
});
