import { Plus, Store } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { ScreenState, SkeletonCard, StaggeredItem } from '../../components';
import { FilterBar } from '../components/FilterBar';
import { ListingCard } from '../components/ListingCard';
import { MARKETPLACE_ROUTES } from '../../constants/routes';
import { useCategories, useListings } from '../hooks/marketplace';
import { useAuthStore } from '../../../state/authStore';
import { useMarketplaceStore } from '../../../state/marketplaceStore';
import {
  useTheme,
  type Theme,
  useRoleAccent,
  type Accent,
} from '../../../theme';
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
  const listingsQuery = useListings(params);
  const { refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    listingsQuery;

  const onRefresh = async () => {
    setPulling(true);
    await refetch();
    setPulling(false);
  };

  const onEndReached = () => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  };

  // The first load shows the grid's shape, two cards a row, so the page does not jump when listings arrive.
  const skeleton = (
    <View style={[styles.list, styles.skeletonGrid]}>
      {Array.from({ length: 6 }, (_, i) => (
        <View key={i} style={styles.skeletonGridCell}>
          <SkeletonCard />
        </View>
      ))}
    </View>
  );

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
      <ScreenState
        query={listingsQuery}
        skeleton={skeleton}
        isEmpty={loaded => loaded.pages.every(page => page.length === 0)}
        empty={{
          icon: Store,
          title: 'No listings yet',
          description: 'Check back soon, or be the first to list produce here.',
        }}
        errorTitle="Couldn't load listings"
      >
        {loaded => (
          <FlashList
            data={loaded.pages.flat()}
            keyExtractor={item => item.id}
            numColumns={2}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl refreshing={pulling} onRefresh={onRefresh} />
            }
            onEndReachedThreshold={0.4}
            onEndReached={onEndReached}
            renderItem={({ item, index }) => (
              <StaggeredItem index={index} style={styles.staggeredCard}>
                <ListingCard
                  listing={item}
                  onPress={() =>
                    navigation.navigate(MARKETPLACE_ROUTES.ListingDetail, {
                      listingId: item.id,
                    })
                  }
                />
              </StaggeredItem>
            )}
          />
        )}
      </ScreenState>
      {canSell ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="List produce for sale"
          style={styles.fab}
          onPress={() => navigation.navigate(MARKETPLACE_ROUTES.CreateListing)}
        >
          <Plus color={theme.colors.onAccent} size={theme.size.iconButton} />
          <Text style={styles.fabLabel}>List</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function makeStyles(
  { colors, space, radius, shadows, typography, size }: Theme,
  accent: Accent,
) {
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
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[1],
      minHeight: size.touchMin,
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
