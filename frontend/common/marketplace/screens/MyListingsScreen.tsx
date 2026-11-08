import { Package } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Button, ListGroup, ListRow, QueryState, ScreenScaffold, StatusBadge } from '../../components';
import { APP_TABS, MARKETPLACE_ROUTES } from '../../constants/routes';
import { useMyListings } from '../hooks/marketplace';
import { navigateInTab } from '../../../navigation/navigateInTab';
import { useAppTabNavigation } from '../../../navigation/stacks/useAppTabNavigation';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';
import { formatAmount, formatRs } from '../../../utils/money';

/** Shared by the farmer's "My listings" and the dealer's "Products": both are the same need, the seller's own listings,
 * reached from different home screens. A row opens the listing inside the Market tab, under that tab's own first
 * screen (MK-01), so Back and the tab both work. */
export function MyListingsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const tabs = useAppTabNavigation();
  const query = useMyListings(userId);
  const listings = query.data ?? [];
  const newListing = () => navigateInTab(tabs, APP_TABS.Marketplace, MARKETPLACE_ROUTES.CreateListing);

  return (
    <ScreenScaffold onRefresh={() => query.refetch()} refreshing={query.isRefetching}>
      <QueryState
        query={query}
        failureTitle="Couldn't load your listings"
        isEmpty={listings.length === 0}
        empty={{ title: 'No listings yet', description: 'List what you sell and buyers will find it in the market.', icon: Package, actionLabel: 'New listing', onAction: newListing }}
      >
        <View style={styles.add}>
          <Button label="New listing" variant="secondary" size="sm" fullWidth={false} onPress={newListing} />
        </View>
        <ListGroup>
          {listings.map(item => (
            <ListRow
              key={item.id}
              title={item.title}
              meta={`${formatRs(item.price)} per ${item.unit} · ${formatAmount(item.quantity)} ${item.unit} available`}
              status={<StatusBadge kind="listing" status={item.status} />}
              leading={
                item.images[0] ? (
                  <Image source={{ uri: item.images[0] }} style={styles.thumb} accessibilityIgnoresInvertColors />
                ) : (
                  <View style={styles.thumb} />
                )
              }
              onPress={() => navigateInTab(tabs, APP_TABS.Marketplace, MARKETPLACE_ROUTES.ListingDetail, { listingId: item.id })}
            />
          ))}
        </ListGroup>
      </QueryState>
    </ScreenScaffold>
  );
}

function makeStyles({ colors, radius, size }: Theme) {
  return StyleSheet.create({
    add: { alignItems: 'flex-start' },
    thumb: { width: size.thumb, height: size.thumb, borderRadius: radius.sm, backgroundColor: colors.surfaceSunken },
  });
}
