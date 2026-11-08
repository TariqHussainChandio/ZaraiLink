import { useFocusEffect } from '@react-navigation/native';
import { Plus } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { Button, EmptyState, ListGroup, ListRow, QueryState, ScreenScaffold, StatusBadge, StickyActionBar, TextField } from '../../common/components';
import { HOME_ROUTES } from '../../common/constants/routes';
import { useStores } from '../hooks/dealer';
import { useAuthStore } from '../../state/authStore';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

/** The dealer's store locations: find one, open it, add another. */
export function StoreListScreen({ navigation }: HomeScreenProps<'Stores'>) {
  const userId = useAuthStore(state => state.user?.id);
  const query = useStores(!!userId);
  const { refetch } = query;
  const stores = useMemo(() => query.data ?? [], [query.data]);
  const [search, setSearch] = useState('');

  // Coming back to the list shows what was added or changed elsewhere.
  useFocusEffect(
    useCallback(() => {
      if (userId) refetch();
    }, [userId, refetch]),
  );

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle === '' ? stores : stores.filter(store => store.name.toLowerCase().includes(needle));
  }, [stores, search]);

  return (
    <ScreenScaffold
      onRefresh={() => {
        refetch();
      }}
      refreshing={query.isRefetching}
      footer={
        <StickyActionBar>
          <Button label="Add store" size="lg" icon={Plus} disabled={!userId} onPress={() => navigation.navigate(HOME_ROUTES.StoreDetail, {})} />
        </StickyActionBar>
      }
    >
      <QueryState
        query={query}
        isEmpty={stores.length === 0}
        failureTitle="Couldn't load your stores"
        empty={{ title: 'No stores yet', description: 'Use Add store below to add your first store location.' }}
      >
        <TextField accessibilityLabel="Find a store" placeholder="Find a store" value={search} onChangeText={setSearch} autoCorrect={false} returnKeyType="search" />
        {shown.length === 0 ? (
          <EmptyState title="No stores match" description="Check the spelling, or clear the search." />
        ) : (
          <ListGroup>
            {shown.map(store => (
              <ListRow
                key={store.id}
                title={store.name}
                meta={store.address ?? 'No address set'}
                status={<StatusBadge kind="storeSupplier" status={store.status} size="sm" />}
                onPress={() => navigation.navigate(HOME_ROUTES.StoreDetail, { storeId: store.id })}
              />
            ))}
          </ListGroup>
        )}
      </QueryState>
    </ScreenScaffold>
  );
}
