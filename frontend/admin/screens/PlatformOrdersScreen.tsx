import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { EmptyState, Spinner } from '../../common/components';
import { OrderCard } from '../../common/orders';
import { ADMIN_HOME_ROUTES } from '../../common/constants/routes';
import { useAllOrders } from '../hooks/admin';
import type { AdminHomeScreenProps } from '../../navigation/stacks/AdminNavigator';
import { useTheme, type Theme } from '../../theme';

/** Platform-wide order overview — every order, not scoped to a buyer/seller segment. */
export function PlatformOrdersScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const navigation = useNavigation<AdminHomeScreenProps<'Orders'>['navigation']>();
  const { data: orders = [], isPending: loading, refetch } = useAllOrders();

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  if (loading) return <Spinner fullscreen />;

  return (
    <View style={styles.container}>
      <FlashList
        data={orders}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <OrderCard
            order={item}
            counterpartyName={`${item.buyer?.full_name ?? 'Unknown buyer'} → ${item.seller?.full_name ?? 'Unknown seller'}`}
            onPress={() => navigation.navigate(ADMIN_HOME_ROUTES.OrderDetail, { orderId: item.id })}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            title="No orders yet"
            description="Platform orders will show up here once placed."
          />
        }
      />
    </View>
  );
}

function makeStyles({ colors, spacing }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.surface,
    },
    list: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
    },
  });
}
