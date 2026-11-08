import { useFocusEffect } from '@react-navigation/native';
import { Plus } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { Button, EmptyState, ListGroup, ListRow, QueryState, ScreenScaffold, StatusBadge, StickyActionBar, TextField } from '../../common/components';
import { HOME_ROUTES } from '../../common/constants/routes';
import { useSuppliers } from '../hooks/dealer';
import { useAuthStore } from '../../state/authStore';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

/** The dealer's suppliers: find one, open it, add another. */
export function SupplierListScreen({ navigation }: HomeScreenProps<'Suppliers'>) {
  const userId = useAuthStore(state => state.user?.id);
  const query = useSuppliers(!!userId);
  const { refetch } = query;
  const suppliers = useMemo(() => query.data ?? [], [query.data]);
  const [search, setSearch] = useState('');

  // Coming back to the list shows what was added or changed elsewhere.
  useFocusEffect(
    useCallback(() => {
      if (userId) refetch();
    }, [userId, refetch]),
  );

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle === '' ? suppliers : suppliers.filter(supplier => supplier.name.toLowerCase().includes(needle));
  }, [suppliers, search]);

  return (
    <ScreenScaffold
      onRefresh={() => {
        refetch();
      }}
      refreshing={query.isRefetching}
      footer={
        <StickyActionBar>
          <Button label="Add supplier" size="lg" icon={Plus} disabled={!userId} onPress={() => navigation.navigate(HOME_ROUTES.SupplierDetail, {})} />
        </StickyActionBar>
      }
    >
      <QueryState
        query={query}
        isEmpty={suppliers.length === 0}
        failureTitle="Couldn't load your suppliers"
        empty={{ title: 'No suppliers yet', description: 'Use Add supplier below to add the people you buy stock from.' }}
      >
        <TextField accessibilityLabel="Find a supplier" placeholder="Find a supplier" value={search} onChangeText={setSearch} autoCorrect={false} returnKeyType="search" />
        {shown.length === 0 ? (
          <EmptyState title="No suppliers match" description="Check the spelling, or clear the search." />
        ) : (
          <ListGroup>
            {shown.map(supplier => (
              <ListRow
                key={supplier.id}
                title={supplier.name}
                meta={supplier.products_supplied ?? 'No products listed'}
                status={<StatusBadge kind="storeSupplier" status={supplier.status} size="sm" />}
                onPress={() => navigation.navigate(HOME_ROUTES.SupplierDetail, { supplierId: supplier.id })}
              />
            ))}
          </ListGroup>
        )}
      </QueryState>
    </ScreenScaffold>
  );
}
