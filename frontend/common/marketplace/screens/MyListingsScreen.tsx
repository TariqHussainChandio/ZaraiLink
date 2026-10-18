import { Store } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { ScreenState, StatusBadge } from '../../components';
import { APP_TABS, MARKETPLACE_ROUTES } from '../../constants/routes';
import { useMyListings } from '../hooks/marketplace';
import { useAppTabNavigation } from '../../../navigation/stacks/useAppTabNavigation';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';
import { formatRs } from '../../../utils/money';
import { statusMeta } from '../../constants/status';

/** Shared by Farmer's "My Listings" and Dealer's "Products" — both are the same underlying
 * need (view my own marketplace listings), just reached from different role dashboards. */
export function MyListingsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const tabNavigation = useAppTabNavigation();
  const listingsQuery = useMyListings(userId);

  return (
    <View style={styles.container}>
      <ScreenState
        query={listingsQuery}
        errorTitle="Couldn't load your listings"
        empty={{
          icon: Store,
          title: 'No listings yet',
          description: 'Listings you create will show up here.',
        }}
      >
        {listings => (
          <FlashList
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
                accessibilityLabel={`${item.title}, ${formatRs(item.price)} per ${item.unit}, ${statusMeta('listing', item.status).label}`}
              >
                <View style={styles.info}>
                  <Text style={styles.title} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {`${formatRs(item.price)}/${item.unit} · Qty ${item.quantity}`}
                  </Text>
                </View>
                <StatusBadge kind="listing" status={item.status} />
              </TouchableOpacity>
            )}
          />
        )}
      </ScreenState>
    </View>
  );
}

function makeStyles({ colors, space, typography, borders }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    list: {
      padding: space[4],
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: space[3],
      borderBottomWidth: borders.hairline,
      borderBottomColor: colors.line,
    },
    info: {
      flex: 1,
      marginRight: space[3],
    },
    title: {
      ...typography.bodyStrong,
      color: colors.ink,
    },
    meta: {
      marginTop: space[1] / 2,
      ...typography.caption,
      color: colors.ink2,
    },
  });
}
