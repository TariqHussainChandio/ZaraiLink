import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import {
  ChipRow,
  ListGroup,
  ListRow,
  QueryState,
  ScreenScaffold,
  Sheet,
  StatusBadge,
  TextField,
  type ChipOption,
} from '../../common/components';
import type { ListingStatus, ListingWithRelations } from '../../common/marketplace';
import { statusMeta } from '../../common/constants/status';
import { useTheme, type Theme } from '../../theme';
import { formatRs } from '../../utils/money';
import { AdminActionSheet, type AdminAction } from '../components/AdminActionSheet';
import { LoadMore } from '../components/LoadMore';
import { useModerationListingPages, useSetListingStatus } from '../hooks/admin';

type Filter = ListingStatus | 'all';

// The status words come from the shared vocabulary, so the filter, the badge and the action all say "Listed" and "Hidden".
const FILTERS: ChipOption<Filter>[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: statusMeta('listing', 'active').label },
  { value: 'inactive', label: statusMeta('listing', 'inactive').label },
  { value: 'sold', label: statusMeta('listing', 'sold').label },
];

/** Every listing, hidden and sold ones too, so the admin can hide one that breaks the rules and list it again (SRDS §8).
 * The API takes a status and nothing else for a listing, so no reason is asked; the audit row records who, what and when. */
export function ListingModerationScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<ListingWithRelations | null>(null);
  const [action, setAction] = useState<AdminAction | null>(null);
  const setListingStatus = useSetListingStatus();

  const needle = search.trim().toLowerCase();
  const loadAll = needle.length > 0 || filter !== 'all';
  const query = useModerationListingPages(loadAll);
  const { rows, refetch } = query;

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const shown = rows.filter(
    l => (filter === 'all' || l.status === filter) && (!needle || `${l.title} ${l.owner?.full_name ?? ''}`.toLowerCase().includes(needle)),
  );

  const toggle = (listing: ListingWithRelations) => {
    const hiding = listing.status === 'active';
    setSelected(null);
    setAction(
      hiding
        ? {
            title: `Hide "${listing.title}"?`,
            message: `Buyers will no longer find "${listing.title}" in the marketplace. ${listing.owner?.full_name || 'The seller'} keeps the listing and you can restore it.`,
            confirmLabel: 'Hide listing',
            destructive: true,
            run: () => setListingStatus.mutateAsync({ id: listing.id, status: 'inactive' }),
            done: 'Listing hidden',
            undo: () => setListingStatus.mutateAsync({ id: listing.id, status: 'active' }),
          }
        : {
            title: `Restore "${listing.title}"?`,
            message: `"${listing.title}" shows in the marketplace again.`,
            confirmLabel: 'Restore listing',
            run: () => setListingStatus.mutateAsync({ id: listing.id, status: 'active' }),
            done: 'Listing restored',
            undo: () => setListingStatus.mutateAsync({ id: listing.id, status: 'inactive' }),
          },
    );
  };

  return (
    <>
      <ScreenScaffold onRefresh={() => refetch()} refreshing={query.isRefetching && !query.isFetchingNextPage}>
        <TextField label="Find a listing" placeholder="Title or seller" value={search} onChangeText={setSearch} autoCorrect={false} />
        <ChipRow options={FILTERS} value={filter} onChange={setFilter} />
        <QueryState
          query={query}
          failureTitle="Couldn't load listings"
          isEmpty={shown.length === 0 && !query.hasNextPage && !query.isFetching}
          empty={
            needle || filter !== 'all'
              ? { title: 'No listing matches', description: 'Try a different title, seller or status.' }
              : { title: 'No listings yet', description: 'Listings show up here once sellers start publishing.' }
          }
        >
          <ListGroup>
            {shown.map(listing => (
              <ListRow
                key={listing.id}
                title={listing.title}
                meta={listing.owner?.full_name || 'Unknown seller'}
                trailing={<Text style={styles.price}>{`${formatRs(listing.price)}/${listing.unit}`}</Text>}
                status={<StatusBadge kind="listing" status={listing.status} />}
                // A sold listing has nothing to moderate.
                onPress={listing.status === 'sold' ? undefined : () => setSelected(listing)}
              />
            ))}
          </ListGroup>
          <LoadMore hasMore={!!query.hasNextPage} loading={query.isFetchingNextPage} onLoadMore={() => query.fetchNextPage()} noun="listings" />
        </QueryState>
      </ScreenScaffold>

      <Sheet visible={!!selected} onClose={() => setSelected(null)} title={selected?.title ?? 'Listing'}>
        <ListGroup>
          <ListRow
            title={selected?.status === 'active' ? 'Hide listing' : 'Restore listing'}
            meta={selected?.status === 'active' ? 'Buyers stop seeing it' : 'Buyers see it again'}
            onPress={() => selected && toggle(selected)}
          />
        </ListGroup>
      </Sheet>

      <AdminActionSheet action={action} onClose={() => setAction(null)} />
    </>
  );
}

function makeStyles({ colors, typography }: Theme) {
  return StyleSheet.create({
    price: { ...typography.price, color: colors.ink },
  });
}
