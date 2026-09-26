import React, { useLayoutEffect, useMemo, useState } from 'react';
import {
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { ShoppingCart } from 'lucide-react-native';
import { EmptyState, SkeletonCard, StaggeredItem } from '../../components/ui';
import { FilterBar } from '../../components/features/marketplace/FilterBar';
import { ListingCard } from '../../components/features/marketplace/ListingCard';
import { MARKETPLACE_ROUTES } from '../../constants/routes';
import { useCategories, useListings } from '../../hooks/api/marketplace';
import { cartItemCount, useCartStore } from '../../store/cartStore';
import { useAuthStore } from '../../store/authStore';
import { useMarketplaceStore } from '../../store/marketplaceStore';
import { useTheme, type Theme } from '../../theme';
import { errorMessage } from '../../utils/errorMessage';
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
      accessibilityLabel={
        count > 0
          ? `Cart, ${count} ${count === 1 ? 'item' : 'items'}`
          : 'Cart'
      }
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

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <CartHeaderButton onPress={() => navigation.navigate(MARKETPLACE_ROUTES.Cart)} />
      ),
    });
  }, [navigation]);

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
