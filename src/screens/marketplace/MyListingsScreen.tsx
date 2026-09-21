import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Badge, EmptyState, Spinner } from '../../components/ui';
import { APP_TABS, MARKETPLACE_ROUTES } from '../../constants/routes';
import { fetchListings } from '../../services/modules/marketplace/listingsService';
import { useAppTabNavigation } from '../../navigation/stacks/useAppTabNavigation';
import { useAuthStore } from '../../store/authStore';
import { useTheme, type Theme } from '../../theme';
import type { ListingWithRelations } from '../../types/marketplace';

/** Shared by Farmer's "My Listings" and Dealer's "Products" — both are the same underlying
 * need (view my own marketplace listings), just reached from different role dashboards. */
export function MyListingsScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const tabNavigation = useAppTabNavigation();
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
        <TouchableOpacity
          style={styles.row}
          activeOpacity={0.7}
          onPress={() =>
            tabNavigation?.navigate(APP_TABS.Marketplace, {
              screen: MARKETPLACE_ROUTES.ListingDetail,
              params: { listingId: item.id },
            })
          }
          accessibilityRole="button"
          accessibilityLabel={t('marketplace.myListings.itemAccessibilityLabel', {
            title: item.title,
            price: item.price.toFixed(0),
            unit: item.unit,
            status: item.status,
          })}
        >
          <View style={styles.info}>
            <Text style={styles.title} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {t('marketplace.myListings.priceQtyLine', {
                price: item.price.toFixed(0),
                unit: item.unit,
                quantity: item.quantity,
              })}
            </Text>
          </View>
          <Badge
            label={item.status}
            tone={item.status === 'active' ? 'success' : item.status === 'sold' ? 'info' : 'neutral'}
          />
        </TouchableOpacity>
      )}
      ListEmptyComponent={
        <EmptyState
          title={t('marketplace.myListings.emptyTitle')}
          description={t('marketplace.myListings.emptyDescription')}
        />
      }
    />
  );
}

function makeStyles({ colors, spacing, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.surface,
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
      borderBottomColor: colors.border,
    },
    info: {
      flex: 1,
      marginRight: spacing.md,
    },
    title: {
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold as any,
      color: colors.text.primary,
    },
    meta: {
      marginTop: spacing.xs / 2,
      fontSize: typography.sizes.sm,
      color: colors.text.secondary,
    },
  });
}
