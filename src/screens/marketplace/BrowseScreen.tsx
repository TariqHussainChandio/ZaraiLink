import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ShoppingCart } from 'lucide-react-native';
import { EmptyState, Spinner } from '../../components/ui';
import { FilterBar } from '../../components/features/marketplace/FilterBar';
import { ListingCard } from '../../components/features/marketplace/ListingCard';
import { MARKETPLACE_ROUTES } from '../../constants/routes';
import { fetchListings } from '../../services/modules/marketplace/listingsService';
import { cartItemCount, useCartStore } from '../../store/cartStore';
import { useAuthStore } from '../../store/authStore';
import { useMarketplaceStore } from '../../store/marketplaceStore';
import { lightTheme } from '../../theme';
import type { ListingWithRelations } from '../../types/marketplace';
import type { MarketplaceScreenProps } from '../../navigation/stacks/MarketplaceNavigator';

const { colors, spacing } = lightTheme;

function CartHeaderButton({ onPress }: { onPress: () => void }) {
  const count = useCartStore(state => cartItemCount(state.items));

  return (
    <TouchableOpacity onPress={onPress} style={styles.cartButton}>
      <ShoppingCart color={colors.neutral.gray800} size={22} />
      {count > 0 ? (
        <View style={styles.cartBadge}>
          <Text style={styles.cartBadgeLabel}>{count}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

export function BrowseScreen({ navigation }: MarketplaceScreenProps<'Browse'>) {
  const role = useAuthStore(state => state.role);
  const canSell = role === 'farmer' || role === 'dealer';
  const { filters, setFilters, categories, loadCategories } = useMarketplaceStore();
  const [listings, setListings] = useState<ListingWithRelations[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <CartHeaderButton onPress={() => navigation.navigate(MARKETPLACE_ROUTES.Cart)} />
      ),
    });
  }, [navigation]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const load = useCallback(
    async (targetPage: number, replace: boolean) => {
      const data = await fetchListings({
        categoryId: filters.categoryId ?? undefined,
        search: filters.search || undefined,
        minPrice: filters.minPrice ?? undefined,
        maxPrice: filters.maxPrice ?? undefined,
        cityId: filters.cityId ?? undefined,
        cropName: filters.cropName ?? undefined,
        page: targetPage,
      });
      setHasMore(data.length > 0);
      setListings(prev => (replace ? data : [...prev, ...data]));
      setPage(targetPage);
    },
    [filters],
  );

  useEffect(() => {
    setLoading(true);
    load(0, true).finally(() => setLoading(false));
  }, [load]);

  const isFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      // Skip the very first focus — the effect above already handles initial load.
      // Refreshes silently on return from Create/Edit/Delete so changes show up immediately.
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      load(0, true);
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load(0, true);
    setRefreshing(false);
  };

  const onEndReached = () => {
    if (!hasMore || loading) return;
    load(page + 1, false);
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
        cityId={filters.cityId}
        cropName={filters.cropName}
        onApplyMoreFilters={setFilters}
      />
      {loading ? (
        <Spinner fullscreen />
      ) : (
        <FlatList
          data={listings}
          keyExtractor={item => item.id}
          numColumns={2}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReachedThreshold={0.4}
          onEndReached={onEndReached}
          renderItem={({ item }) => (
            <ListingCard
              listing={item}
              onPress={() =>
                navigation.navigate(MARKETPLACE_ROUTES.ListingDetail, { listingId: item.id })
              }
            />
          )}
          ListEmptyComponent={
            <EmptyState
              title="No listings yet"
              description="Check back soon, or be the first to list produce here."
            />
          }
        />
      )}
      {canSell ? (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate(MARKETPLACE_ROUTES.CreateListing)}
        >
          <Text style={styles.fabLabel}>+ List</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
  },
  list: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing['3xl'],
  },
  cartButton: {
    marginRight: spacing.md,
  },
  cartBadge: {
    position: 'absolute',
    top: -6,
    right: -8,
    backgroundColor: colors.semantic.error,
    borderRadius: 999,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadgeLabel: {
    color: colors.neutral.white,
    fontSize: 10,
    fontWeight: '700',
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    backgroundColor: colors.brand.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: lightTheme.radii.full,
  },
  fabLabel: {
    color: colors.neutral.white,
    fontWeight: '700',
  },
});
