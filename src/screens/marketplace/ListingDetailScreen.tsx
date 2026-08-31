import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar, Button, EmptyState, Spinner } from '../../components/ui';
import { RatingSummary } from '../../components/features/reviews/RatingSummary';
import { ReviewCard } from '../../components/features/reviews/ReviewCard';
import { APP_TABS, MARKETPLACE_ROUTES, MESSAGING_ROUTES } from '../../constants/routes';
import { fetchListingById, recordListingView } from '../../services/modules/marketplace/listingsService';
import { findOrCreateConversation } from '../../services/modules/messaging/messagingService';
import { fetchReviewsForListing } from '../../services/modules/reviews/reviewsService';
import { useAuthStore } from '../../store/authStore';
import { useCartStore } from '../../store/cartStore';
import { useAppTabNavigation } from '../../navigation/stacks/useAppTabNavigation';
import { useTheme, type Theme } from '../../theme';
import { hapticTap } from '../../utils/haptics';
import type { ListingWithRelations } from '../../types/marketplace';
import type { ReviewWithBuyer } from '../../types/reviews';
import type { MarketplaceScreenProps } from '../../navigation/stacks/MarketplaceNavigator';

export function ListingDetailScreen({ route, navigation }: MarketplaceScreenProps<'ListingDetail'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { listingId } = route.params;
  const userId = useAuthStore(state => state.user?.id);
  const addItem = useCartStore(state => state.addItem);
  const tabNavigation = useAppTabNavigation();
  const [listing, setListing] = useState<ListingWithRelations | null>(null);
  const [reviews, setReviews] = useState<ReviewWithBuyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [messaging, setMessaging] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([fetchListingById(listingId), fetchReviewsForListing(listingId)])
      .then(([listingData, reviewsData]) => {
        setListing(listingData);
        setReviews(reviewsData);
        // Fire-and-forget: view tracking shouldn't block or fail the listing render.
        if (userId && listingData.owner_id !== userId) {
          recordListingView(listingId).catch(() => {});
        }
      })
      .catch(err => {
        console.warn('[ListingDetailScreen] failed to load listing:', err);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Spinner fullscreen />;
  if (!listing) {
    return (
      <EmptyState
        title="Listing not found"
        description="It may have been removed, or there was a connection problem."
        actionLabel="Retry"
        onAction={load}
      />
    );
  }

  const isOwner = listing.owner_id === userId;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {listing.images[0] ? (
        <Image source={{ uri: listing.images[0] }} style={styles.image} />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder]} />
      )}

      <Text style={styles.title}>{listing.title}</Text>
      <Text style={styles.price}>
        Rs. {listing.price.toFixed(0)} / {listing.unit} · {listing.quantity} {listing.unit}{' '}
        available
      </Text>
      {listing.category ? <Text style={styles.category}>{listing.category.name}</Text> : null}
      {listing.description ? <Text style={styles.description}>{listing.description}</Text> : null}

      {listing.owner ? (
        <View style={styles.sellerRow}>
          <Avatar name={listing.owner.full_name} uri={listing.owner.avatar_url} size={36} />
          <Text style={styles.sellerName}>{listing.owner.full_name}</Text>
        </View>
      ) : null}

      {isOwner ? (
        <Button
          label="Edit Listing"
          onPress={() =>
            navigation.navigate(MARKETPLACE_ROUTES.EditListing, { listingId: listing.id })
          }
          style={styles.action}
        />
      ) : (
        <>
          <Button
            label="Add to Cart"
            onPress={() => {
              addItem({
                listingId: listing.id,
                sellerId: listing.owner_id,
                title: listing.title,
                price: listing.price,
                unit: listing.unit,
                image: listing.images[0] ?? null,
              });
              hapticTap();
              Alert.alert('Added to cart', `${listing.title} was added to your cart.`);
            }}
            style={styles.action}
          />
          <Button
            label="Message Seller"
            variant="secondary"
            loading={messaging}
            onPress={async () => {
              if (!userId || !listing.owner) return;
              setMessaging(true);
              try {
                const conversation = await findOrCreateConversation(listing.owner_id);
                tabNavigation?.navigate(APP_TABS.Messages, {
                  screen: MESSAGING_ROUTES.Chat,
                  params: { conversationId: conversation.id, otherUserName: listing.owner.full_name },
                });
              } finally {
                setMessaging(false);
              }
            }}
            style={styles.secondaryAction}
          />
        </>
      )}

      <View style={styles.reviewsSection}>
        <Text style={styles.sectionTitle}>Reviews</Text>
        <RatingSummary reviews={reviews} />
        {reviews.map(review => (
          <ReviewCard key={review.id} review={review} />
        ))}
      </View>
    </ScrollView>
  );
}

function makeStyles({ colors, spacing, radii, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.surface,
    },
    content: {
      padding: spacing.lg,
    },
    image: {
      width: '100%',
      height: 220,
      borderRadius: radii.lg,
      backgroundColor: colors.border,
    },
    imagePlaceholder: {},
    title: {
      marginTop: spacing.lg,
      fontSize: typography.sizes['2xl'],
      fontWeight: typography.weights.bold as any,
      color: colors.text.primary,
    },
    price: {
      marginTop: spacing.xs,
      fontSize: typography.sizes.base,
      color: colors.brand.primary,
      fontWeight: typography.weights.semibold as any,
    },
    category: {
      marginTop: spacing.xs,
      fontSize: typography.sizes.sm,
      color: colors.text.secondary,
    },
    description: {
      marginTop: spacing.md,
      fontSize: typography.sizes.base,
      color: colors.text.secondary,
      lineHeight: typography.lineHeights.base,
    },
    sellerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing.lg,
      gap: spacing.sm,
    },
    sellerName: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.medium as any,
      color: colors.text.primary,
    },
    action: {
      marginTop: spacing.xl,
    },
    secondaryAction: {
      marginTop: spacing.md,
    },
    reviewsSection: {
      marginTop: spacing.xl,
    },
    sectionTitle: {
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold as any,
      color: colors.text.primary,
      marginBottom: spacing.sm,
    },
  });
}
