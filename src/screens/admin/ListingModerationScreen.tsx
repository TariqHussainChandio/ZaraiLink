import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Spinner } from '../../components/ui';
import { fetchAllListingsForModeration, updateListingStatus } from '../../services/modules/marketplace/listingsService';
import { useAuthStore } from '../../store/authStore';
import { lightTheme } from '../../theme';
import type { ListingWithRelations } from '../../types/marketplace';

const { colors, spacing, typography } = lightTheme;

export function ListingModerationScreen() {
  const actorId = useAuthStore(state => state.user?.id);
  const [listings, setListings] = useState<ListingWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setListings(await fetchAllListingsForModeration());
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const toggleActive = async (listing: ListingWithRelations) => {
    if (!actorId) return;
    setUpdatingId(listing.id);
    try {
      await updateListingStatus(listing.id, listing.status === 'active' ? 'inactive' : 'active');
      await load();
    } finally {
      setUpdatingId(null);
    }
  };

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
            <Text style={styles.owner} numberOfLines={1}>
              {item.owner?.full_name ?? 'Unknown'} · Rs. {item.price.toFixed(0)}/{item.unit}
            </Text>
            <Badge
              label={item.status}
              tone={item.status === 'active' ? 'success' : item.status === 'sold' ? 'info' : 'neutral'}
            />
          </View>
          {item.status !== 'sold' ? (
            <Button
              label={item.status === 'active' ? 'Deactivate' : 'Activate'}
              variant={item.status === 'active' ? 'destructive' : 'secondary'}
              fullWidth={false}
              loading={updatingId === item.id}
              onPress={() => toggleActive(item)}
            />
          ) : null}
        </View>
      )}
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
    marginRight: spacing.sm,
  },
  title: {
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold as any,
    color: colors.neutral.gray900,
  },
  owner: {
    fontSize: typography.sizes.xs,
    color: colors.neutral.gray500,
    marginVertical: spacing.xs,
  },
});
