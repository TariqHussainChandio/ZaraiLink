// Seller profile: details, listings and reviews.
import { MessageSquare, Store } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Avatar, Button, QueryState, RoleBadge, ScreenScaffold, Skeleton } from '../../components';
import { MARKETPLACE_ROUTES } from '../../constants/routes';
import { RatingSummary, ReviewCard, useSellerReviews } from '../../reviews';
import { ListingCard } from '../components/ListingCard';
import { useMyListings } from '../hooks/marketplace';
import type { ListingWithRelations } from '../types/marketplace';
import { useTheme, type Theme } from '../../../theme';
import type { MarketplaceScreenProps } from '../../../navigation/stacks/MarketplaceNavigator';

/** Shop reviews shown before "Show all": enough to judge the seller without a long scroll past their listings. */
const REVIEWS_PREVIEW = 5;

/** Two cards to a row, like the market grid. */
function pairs<T>(items: T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return rows;
}

/**
 * A seller's shop (D20), opened from the seller row of a listing: who they are, their rating, everything they have for
 * sale, and what buyers said about their orders. Every read here is public, as browsing is (D18): the listings route
 * filtered by owner (`useMyListings` reads the same route) and the seller's reviews.
 */
export function SellerProfileScreen({ route, navigation }: MarketplaceScreenProps<'SellerProfile'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { sellerId, name, avatarUrl, role, city } = route.params;
  const listingsQuery = useMyListings(sellerId);
  const reviewsQuery = useSellerReviews(sellerId);
  const [showAllReviews, setShowAllReviews] = useState(false);

  // The seller looking at their own shop gets their hidden and sold listings from the same route (My Listings needs
  // them); the shop shows only what is for sale, as everyone else sees it.
  const listings = (listingsQuery.data ?? []).filter((listing: ListingWithRelations) => listing.status === 'active');
  const reviews = reviewsQuery.data ?? [];
  const visibleReviews = showAllReviews ? reviews : reviews.slice(0, REVIEWS_PREVIEW);

  // Reloads the seller's listings and reviews.
  const refresh = () => {
    listingsQuery.refetch();
    reviewsQuery.refetch();
  };

  return (
    <ScreenScaffold onRefresh={refresh} refreshing={listingsQuery.isRefetching || reviewsQuery.isRefetching}>
      <View style={styles.head}>
        <Avatar name={name} uri={avatarUrl} role={role ?? undefined} size={theme.size.avatarLg} />
        <View style={styles.identity}>
          <Text style={styles.name} accessibilityRole="header">
            {name || 'Seller'}
          </Text>
          <View style={styles.badges}>
            {role ? <RoleBadge role={role} /> : null}
            {city ? <Text style={styles.town}>{city}</Text> : null}
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Shop rating
        </Text>
        {reviewsQuery.isPending ? <Skeleton style={styles.skeleton} /> : <RatingSummary reviews={reviews} />}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {listingsQuery.data ? `For sale (${listings.length})` : 'For sale'}
        </Text>
        <QueryState
          query={listingsQuery}
          skeleton="cards"
          failureTitle="Couldn't load this seller's listings"
          isEmpty={listings.length === 0}
          empty={{ title: 'Nothing for sale right now', description: 'This seller has no open listings.', icon: Store }}
        >
          <View style={styles.grid}>
            {pairs(listings).map(row => (
              <View key={row.map(listing => listing.id).join('-')} style={styles.row}>
                {row.map(listing => (
                  <ListingCard
                    key={listing.id}
                    listing={listing}
                    onPress={() => navigation.push(MARKETPLACE_ROUTES.ListingDetail, { listingId: listing.id })}
                  />
                ))}
                {/* An odd last card keeps half the row, not the whole of it. */}
                {row.length === 1 ? <View style={styles.spacer} /> : null}
              </View>
            ))}
          </View>
        </QueryState>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Shop reviews
        </Text>
        <QueryState
          query={reviewsQuery}
          failureTitle="Couldn't load the reviews"
          isEmpty={reviews.length === 0}
          empty={{ title: 'No reviews yet', description: 'Buyers review a seller after an order arrives.', icon: MessageSquare }}
        >
          <View style={styles.reviews}>
            {visibleReviews.map(review => (
              <ReviewCard key={review.id} review={review} />
            ))}
            {reviews.length > REVIEWS_PREVIEW && !showAllReviews ? (
              <Button label={`Show all ${reviews.length} reviews`} variant="quiet" onPress={() => setShowAllReviews(true)} />
            ) : null}
          </View>
        </QueryState>
      </View>
    </ScreenScaffold>
  );
}

// Builds the styles from the theme.
function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    head: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
    identity: { flex: 1, gap: space[1] },
    name: { ...typography.titleLg, color: colors.ink },
    badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] },
    town: { ...typography.caption, color: colors.ink2 },
    section: { gap: space[2] },
    sectionTitle: { ...typography.title, color: colors.ink },
    // The cards carry their own margin (ListingCard), so the grid pulls in by it to line up with the headings.
    grid: { marginHorizontal: -space[2] },
    row: { flexDirection: 'row' },
    spacer: { flex: 1, margin: space[2] },
    reviews: { gap: space[2] },
    skeleton: { width: '100%', height: space[12] },
  });
}
