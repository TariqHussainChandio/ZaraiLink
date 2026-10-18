import { FlashList } from '@shopify/flash-list';
import { ClipboardList, Plus } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { Button, ChipRow, EmptyState, ListRow, ScreenState, StatusBadge } from '../../common/components';
import { type Theme, useTheme } from '../../theme';
import { formatDate } from '../components/format';
import { makeScreenStyles } from '../components/screenStyles';
import { usePurchases, useSuppliers } from '../hooks/inventory';
import type { PurchaseStatus } from '../types/inventory';
import { INVENTORY_ROUTES, type InventoryScreenProps } from '../types/navigation';

type Filter = PurchaseStatus | 'all';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'received', label: 'Received' },
  { value: 'cancelled', label: 'Cancelled' },
];

/** Purchases from suppliers (SRDS §23): drafts waiting for the goods, and the ones received into stock. */
export function PurchaseListScreen({ navigation }: InventoryScreenProps<typeof INVENTORY_ROUTES.Purchases>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [filter, setFilter] = useState<Filter>('all');
  const result = usePurchases(filter === 'all' ? null : filter);
  const { data, refetch, isRefetching } = result;
  const suppliers = useSuppliers();
  const supplierName = useMemo(
    () => new Map((suppliers.data ?? []).map(supplier => [supplier.id, supplier.name])),
    [suppliers.data],
  );

  return (
    <View style={styles.screen}>
      <FlashList
        data={data ?? []}
        keyExtractor={purchase => purchase.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Button label="New purchase" icon={Plus} onPress={() => navigation.navigate(INVENTORY_ROUTES.PurchaseForm)} />
            <ChipRow options={FILTERS} value={filter} onChange={setFilter} />
          </View>
        }
        renderItem={({ item: purchase }) => (
          <ListRow
            title={purchase.reference || (purchase.supplier_id ? supplierName.get(purchase.supplier_id) : null) || 'Purchase'}
            meta={[
              formatDate(purchase.purchased_on),
              purchase.supplier_id ? supplierName.get(purchase.supplier_id) : null,
              `${purchase.items?.length ?? 0} lines`,
            ]
              .filter(Boolean)
              .join(' · ')}
            trailing={<StatusBadge kind="purchase" status={purchase.status} size="sm" />}
            onPress={() => navigation.navigate(INVENTORY_ROUTES.PurchaseDetail, { purchaseId: purchase.id })}
          />
        )}
        ListEmptyComponent={
          data ? (
            <EmptyState
              icon={ClipboardList}
              title="No purchases"
              description="Record a purchase from a supplier, then receive it into stock when the goods arrive."
            />
          ) : (
            <ScreenState query={result} errorTitle="Couldn't load your purchases" />
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
    header: { gap: theme.space[3], marginBottom: theme.space[3] },
  };
}
