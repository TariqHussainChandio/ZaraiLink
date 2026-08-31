import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ShoppingCart } from 'lucide-react-native';
import { EmptyState, SkeletonCard, StaggeredItem } from '../../components/ui';
import { FilterBar } from '../../components/features/marketplace/FilterBar';
import { ListingCard } from '../../components/features/marketplace/ListingCard';
import { MARKETPLACE_ROUTES } from '../../constants/routes';
import { fetchListings } from '../../services/modules/marketplace/listingsService';
import { cartItemCount, useCartStore } from '../../store/cartStore';
import { useAuthStore } from '../../store/authStore';
import { useMarketplaceStore } from '../../store/marketplaceStore';
import { useTheme, type Theme } from '../../theme';
import type { ListingWithRelations } from '../../types/marketplace';
import type { MarketplaceScreenProps } from '../../navigation/stacks/MarketplaceNavigator';

function CartHeaderButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const count = useCartStore(state => cartItemCount(state.items));

  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.cartButton}
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `Cart, ${count} item${count === 1 ? '' : 's'}` : 'Cart'}
    >
      <View style={styles.cartIconWrap}>
        <ShoppingCart color={theme.colors.text.primary} size={22} />
        {count > 0 ? (
          <View style={styles.cartBadge}>
            <Text style={styles.cartBadgeLabel}>{count}</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export function BrowseScreen({ navigation }: MarketplaceScreenProps<'Browse'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
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
        city: filters.city ?? undefined,
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
        city={filters.city}
        cropName={filters.cropName}
        onApplyMoreFilters={setFilters}
      />
      {loading ? (
        <View style={[styles.list, styles.skeletonGrid]}>
          {Array.from({ length: 6 }, (_, i) => (
            <View key={i} style={styles.skeletonGridCell}>
              <SkeletonCard />
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={item => item.id}
          numColumns={2}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
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

function makeStyles({ colors, spacing, radii, shadows }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.surface,
    },
    list: {
      paddingHorizontal: spacing.sm,
      paddingBottom: spacing['3xl'],
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
    cartButton: {
      marginRight: spacing.md,
      minWidth: 44,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cartIconWrap: {
      width: 22,
      height: 22,
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
      borderRadius: radii.full,
      ...shadows.md,
    },
    fabLabel: {
      color: colors.neutral.white,
      fontWeight: '700',
    },
  });
}
