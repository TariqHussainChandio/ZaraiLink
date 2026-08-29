import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Badge, EmptyState, Spinner } from '../../components/ui';
import { fetchListings } from '../../services/modules/marketplace/listingsService';
import { useAuthStore } from '../../store/authStore';
import { lightTheme } from '../../theme';
import type { ListingWithRelations } from '../../types/marketplace';

const { colors, spacing, typography } = lightTheme;

/** Shared by Farmer's "My Listings" and Dealer's "Products" — both are the same underlying
 * need (view my own marketplace listings), just reached from different role dashboards. */
export function MyListingsScreen() {
  const userId = useAuthStore(state => state.user?.id);
  const [listings, setListings] = useState<ListingWithRelations[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      setListings(await fetchListings({ ownerId: userId }));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading) return <Spinner fullscreen />;

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.list}
      data={listings}
      keyExtractor={item => item.id}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={styles.info}>
            <Text style={styles.title} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              Rs. {item.price.toFixed(0)}/{item.unit} · Qty {item.quantity}
            </Text>
          </View>
          <Badge
            label={item.status}
            tone={item.status === 'active' ? 'success' : item.status === 'sold' ? 'info' : 'neutral'}
          />
        </View>
      )}
      ListEmptyComponent={
        <EmptyState title="No listings yet" description="Listings you create will show up here." />
      }
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
  },
  list: {
    padding: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.gray100,
  },
  info: {
    flex: 1,
    marginRight: spacing.md,
  },
  title: {
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold as any,
    color: colors.neutral.gray900,
  },
  meta: {
    marginTop: spacing.xs / 2,
    fontSize: typography.sizes.sm,
    color: colors.neutral.gray600,
  },
});
