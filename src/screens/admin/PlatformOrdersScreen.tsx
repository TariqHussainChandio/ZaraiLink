import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';
import { EmptyState, Spinner } from '../../components/ui';
import { OrderCard } from '../../components/features/orders/OrderCard';
import { ADMIN_HOME_ROUTES } from '../../constants/routes';
import { fetchAllOrders } from '../../services/modules/admin/adminService';
import type { AdminHomeScreenProps } from '../../navigation/stacks/AdminNavigator';
import { useTheme, type Theme } from '../../theme';
import type { OrderWithItems } from '../../types/orders';

/** Platform-wide order overview — every order, not scoped to a buyer/seller segment. */
export function PlatformOrdersScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const navigation = useNavigation<AdminHomeScreenProps<'Orders'>['navigation']>();
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
            counterpartyName={t('admin.platformOrders.counterpartyLine', {
              buyer: item.buyer?.full_name ?? t('admin.platformOrders.unknownBuyer'),
              seller: item.seller?.full_name ?? t('admin.platformOrders.unknownSeller'),
            })}
            onPress={() => navigation.navigate(ADMIN_HOME_ROUTES.OrderDetail, { orderId: item.id })}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            title={t('admin.platformOrders.emptyTitle')}
            description={t('admin.platformOrders.emptyDescription')}
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
