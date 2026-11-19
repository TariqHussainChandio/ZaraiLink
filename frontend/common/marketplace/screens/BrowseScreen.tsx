import { Plus, SearchX, Store } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Button, QueryState, ScreenScaffold, Spinner } from '../../components';
import { FilterBar } from '../components/FilterBar';
import { ListingCard } from '../components/ListingCard';
import { MARKETPLACE_ROUTES } from '../../constants/routes';
import { useCategories, useListings } from '../hooks/marketplace';
import { useAuthStore } from '../../../state/authStore';
import { useMarketplaceStore } from '../../../state/marketplaceStore';
import { useTheme, type Theme } from '../../../theme';
import type { MarketplaceScreenProps } from '../../../navigation/stacks/MarketplaceNavigator';

/** The market: a two-column grid people scan for price. Each card leads with its rate plate, then the name and who sells
 * it. Search waits for typing to stop, the old grid stays until the new one arrives, and a list that is empty says whether
 * that is because of the filters. */
export function BrowseScreen({ navigation }: MarketplaceScreenProps<'Browse'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const role = useAuthStore(state => state.role);
  const canSell = role === 'farmer' || role === 'dealer';
  const { filters, setFilters, resetFilters } = useMarketplaceStore();
  const { data: categories = [] } = useCategories();
  const [pulling, setPulling] = useState(false);

  const params = useMemo(
    () => ({
      categoryId: filters.categoryId ?? undefined,
      search: filters.search || undefined,
      minPrice: filters.minPrice ?? undefined,
      maxPrice: filters.maxPrice ?? undefined,
      city: filters.city ?? undefined,
      cropName: filters.cropName ?? undefined,
    }),
    [filters],
  );
  const query = useListings(params);
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError, refetch } = query;
  const listings = useMemo(() => data?.pages.flat() ?? [], [data]);
  const filtered = Object.values(params).some(value => value !== undefined);

  const onRefresh = async () => {
    setPulling(true);
    await refetch();
    setPulling(false);
  };

  const onEndReached = () => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) fetchNextPage();
  };

  const newListing = () => navigation.navigate(MARKETPLACE_ROUTES.CreateListing);

  return (
    <ScreenScaffold scroll={false} contentStyle={styles.column}>
      {canSell ? (
        // Beside the cart in the app bar once the navigator offers it there (a request to zl-app-core); until then it
        // is the first thing under the title, a real button of its own, never a floating one over the last row (MK-18).
        <View style={styles.sell}>
          <Button label="New listing" icon={Plus} variant="secondary" size="sm" fullWidth={false} onPress={newListing} />
        </View>
      ) : null}
      <FilterBar
        search={filters.search}
        onSearchChange={search => setFilters({ search })}
        categories={categories}
        selectedCategoryId={filters.categoryId}
        onSelectCategory={categoryId => setFilters({ categoryId })}
        minPrice={filters.minPrice}
        maxPrice={filters.maxPrice}
        city={filters.city}
        cropName={filters.cropName}
        onApplyMoreFilters={setFilters}
      />
      <View style={styles.results}>
        <QueryState
          query={query}
          skeleton="cards"
          failureTitle="Couldn't load the market"
          isEmpty={listings.length === 0}
          empty={
            filtered
              ? { title: 'No listings match', description: 'Try a wider price range or another city.', icon: SearchX, actionLabel: 'Clear filters', onAction: resetFilters }
              : canSell
                ? { title: 'Nothing is listed yet', description: 'List what you sell and buyers will see it here.', icon: Store, actionLabel: 'New listing', onAction: newListing }
                : { title: 'Nothing is listed yet', description: 'Check back soon. New listings appear here.', icon: Store }
          }
        >
          <FlashList
            data={listings}
            keyExtractor={item => item.id}
            numColumns={2}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={pulling} onRefresh={onRefresh} />}
            onEndReachedThreshold={0.4}
            onEndReached={onEndReached}
            renderItem={({ item }) => (
              <ListingCard listing={item} onPress={() => navigation.navigate(MARKETPLACE_ROUTES.ListingDetail, { listingId: item.id })} />
            )}
            ListFooterComponent={
              isFetchingNextPage ? (
                <Spinner />
              ) : isFetchNextPageError ? (
                <View style={styles.more}>
                  <Button label="Couldn't load more. Try again" variant="secondary" fullWidth={false} onPress={() => fetchNextPage()} />
                </View>
              ) : null
            }
          />
        </QueryState>
      </View>
    </ScreenScaffold>
  );
}

function makeStyles({ space }: Theme) {
  return StyleSheet.create({
    // The grid fills the screen under the filters; the scaffold's gap between sections would push it down.
    column: { gap: 0 },
    sell: { alignItems: 'flex-start' },
    results: { flex: 1 },
    list: { paddingBottom: space[6] },
    more: { alignItems: 'center', padding: space[4] },
  });
}
