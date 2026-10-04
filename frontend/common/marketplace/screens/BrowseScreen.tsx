import React, { useMemo, useState } from 'react';
import {
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { EmptyState, SkeletonCard, StaggeredItem } from '../../components';
import { FilterBar } from '../components/FilterBar';
import { ListingCard } from '../components/ListingCard';
import { MARKETPLACE_ROUTES } from '../../constants/routes';
import { useCategories, useListings } from '../hooks/marketplace';
import { useAuthStore } from '../../../state/authStore';
import { useMarketplaceStore } from '../../../state/marketplaceStore';
import { useTheme, type Theme, useRoleAccent, type Accent } from '../../../theme';
import { errorMessage } from '../../../utils/errorMessage';
import type { MarketplaceScreenProps } from '../../../navigation/stacks/MarketplaceNavigator';

export function BrowseScreen({ navigation }: MarketplaceScreenProps<'Browse'>) {
  const theme = useTheme();
  const accent = useRoleAccent();
  const styles = useMemo(() => makeStyles(theme, accent), [theme, accent]);
  const role = useAuthStore(state => state.role);
  const canSell = role === 'farmer' || role === 'dealer';
  const { filters, setFilters } = useMarketplaceStore();
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
  const { data, isPending, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useListings(params);
  const listings = useMemo(() => data?.pages.flat() ?? [], [data]);

  const onRefresh = async () => {
    setPulling(true);
    await refetch();
    setPulling(false);
  };

  const onEndReached = () => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  };

  return (
    <View style={styles.container}>
      <FilterBar
        search={filters.search}
        onSearchChange={value => setFilters({ search: value })}
        categories={categories}
        selectedCategoryId={filters.categoryId}
        onSelectCategory={categoryId => setFilters({ categoryId })}
        minPrice={filters.minPrice}
        maxPrice={filters.maxPrice}
        city={filters.city}
        cropName={filters.cropName}
        onApplyMoreFilters={setFilters}
      />
      {isPending ? (
        <View style={[styles.list, styles.skeletonGrid]}>
          {Array.from({ length: 6 }, (_, i) => (
            <View key={i} style={styles.skeletonGridCell}>
              <SkeletonCard />
            </View>
          ))}
        </View>
      ) : (
        <FlashList
          data={listings}
          keyExtractor={item => item.id}
          numColumns={2}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={pulling} onRefresh={onRefresh} />}
          onEndReachedThreshold={0.4}
          onEndReached={onEndReached}
          renderItem={({ item, index }) => (
            <StaggeredItem index={index} style={styles.staggeredCard}>
              <ListingCard
                listing={item}
                onPress={() =>
                  navigation.navigate(MARKETPLACE_ROUTES.ListingDetail, { listingId: item.id })
                }
              />
            </StaggeredItem>
          )}
          ListEmptyComponent={
            error ? (
              <EmptyState
                title="Could not load listings"
                description={errorMessage(error)}
                actionLabel="Retry"
                onAction={() => refetch()}
              />
            ) : (
              <EmptyState
                title="No listings yet"
                description="Check back soon, or be the first to list produce here."
              />
            )
          }
        />
      )}
      {canSell ? (
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.fab}
          onPress={() => navigation.navigate(MARKETPLACE_ROUTES.CreateListing)}
        >
          <Text style={styles.fabLabel}>+ List</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function makeStyles({ colors, space, radius, shadows, typography }: Theme, accent: Accent) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    list: {
      paddingHorizontal: space[2],
      paddingBottom: space[12],
    },
    skeletonGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    skeletonGridCell: {
      width: '50%',
    },
    staggeredCard: {
      flex: 1,
    },
    fab: {
      position: 'absolute',
      right: space[4],
      bottom: space[4],
      backgroundColor: accent.fill,
      paddingHorizontal: space[4],
      paddingVertical: space[3],
      borderRadius: radius.pill,
      ...shadows.elev2,
    },
    fabLabel: {
      ...typography.label,
      color: colors.onAccent,
    },
  });
}
