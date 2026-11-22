import { FlashList } from '@shopify/flash-list';
import { Plus, Truck } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { RefreshControl, View } from 'react-native';
import { Badge, Button, EmptyState, ListRow, ScreenState } from '../../common/components';
import { type Theme, useTheme } from '../../theme';
import { makeScreenStyles } from '../components/screenStyles';
import { useSuppliers } from '../hooks/inventory';
import { INVENTORY_ROUTES, type InventoryScreenProps } from '../types/navigation';

/** The dealer's suppliers (SRDS §23). */
export function SupplierListScreen({ navigation }: InventoryScreenProps<typeof INVENTORY_ROUTES.Suppliers>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const result = useSuppliers();
  const { data, refetch, isRefetching } = result;

  return (
    <View style={styles.screen}>
      <FlashList
        data={data ?? []}
        keyExtractor={supplier => supplier.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Button label="Add supplier" icon={Plus} onPress={() => navigation.navigate(INVENTORY_ROUTES.SupplierForm, {})} />
          </View>
        }
        renderItem={({ item: supplier }) => (
          <ListRow
            title={supplier.name}
            meta={[supplier.contact, supplier.products_supplied].filter(Boolean).join(' · ') || undefined}
            trailing={supplier.is_active ? undefined : <Badge label="Inactive" size="sm" />}
            onPress={() => navigation.navigate(INVENTORY_ROUTES.SupplierForm, { supplierId: supplier.id })}
          />
        )}
        ListEmptyComponent={
          data ? (
            <EmptyState icon={Truck} title="No suppliers yet" description="Add who you buy from to record purchases." />
          ) : (
            <ScreenState query={result} errorTitle="Couldn't load your suppliers" />
          )
        }
      />
    </View>
  );
}

function makeStyles(theme: Theme) {
  return {
    ...makeScreenStyles(theme),
    list: { padding: theme.space[4], paddingBottom: theme.space[12] },
    header: { marginBottom: theme.space[3] },
  };
}
