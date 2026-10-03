import React, { useEffect, useMemo } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar, Button, EmptyState, Spinner } from '../../components';
import { RatingSummary, ReviewCard, useListingReviews } from '../../reviews';
import { APP_TABS, MARKETPLACE_ROUTES, MESSAGING_ROUTES } from '../../constants/routes';
import { useListing, useRecordListingView } from '../hooks/marketplace';
import { useOpenConversation } from '../../messaging';
import { useAuthStore } from '../../../state/authStore';
import { useCartStore } from '../../../state/cartStore';
import { useAppTabNavigation } from '../../../navigation/stacks/useAppTabNavigation';
import { useTheme, type Theme } from '../../../theme';
import { errorMessage } from '../../../utils/errorMessage';
import { hapticTap } from '../../../utils/haptics';
import type { MarketplaceScreenProps } from '../../../navigation/stacks/MarketplaceNavigator';
import { formatRs } from '../../../utils/money';

export function ListingDetailScreen({ route, navigation }: MarketplaceScreenProps<'ListingDetail'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { listingId } = route.params;
  const userId = useAuthStore(state => state.user?.id);
  const addItem = useCartStore(state => state.addItem);
  const tabNavigation = useAppTabNavigation();
  const { data: listing, isPending, refetch } = useListing(listingId);
  const { data: reviews = [] } = useListingReviews(listingId);
  const openConversation = useOpenConversation();
  const { mutate: recordView } = useRecordListingView();

  const ownerId = listing?.owner_id;
  useEffect(() => {
    // Fire-and-forget: view tracking must not block or fail the render. Once per screen visit, not per refetch.
    if (userId && ownerId && ownerId !== userId) recordView(listingId);
  }, [listingId, ownerId, userId, recordView]);

  if (isPending) return <Spinner fullscreen />;
  if (!listing) {
    return (
      <EmptyState
        title="Listing not found"
        description="It may have been removed, or there was a connection problem."
        actionLabel="Retry"
        onAction={() => refetch()}
      />
    );
  }

  const isOwner = listing.owner_id === userId;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {listing.images[0] ? (
        <Image source={{ uri: listing.images[0] }} style={styles.image} />
      ) : (
        <View style={styles.image} />
      )}

      <Text style={styles.title}>{listing.title}</Text>
      <Text style={styles.price}>
        {`${formatRs(listing.price)} / ${listing.unit} · ${listing.quantity} ${listing.unit} available`}
      </Text>
      {listing.category ? <Text style={styles.category}>{listing.category.name}</Text> : null}
      {listing.description ? <Text style={styles.description}>{listing.description}</Text> : null}

      {listing.owner ? (
        <View style={styles.sellerRow}>
          <Avatar name={listing.owner.full_name} uri={listing.owner.avatar_url} size={theme.size.avatarMd} />
          <Text style={styles.sellerName}>{listing.owner.full_name || 'Unknown seller'}</Text>
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
              Alert.alert(
                'Added to cart',
                `${listing.title} was added to your cart.`,
              );
            }}
            style={styles.action}
          />
          <Button
            label="Message Seller"
            variant="secondary"
            loading={openConversation.isPending}
            onPress={async () => {
              if (!userId || !listing.owner) return;
              try {
                const conversation = await openConversation.mutateAsync(listing.owner_id);
                // On top of the conversation list (initial: false), so Back and the Messages tab reach it, not a stack whose root is this chat.
                tabNavigation?.navigate(APP_TABS.Messages, {
                  screen: MESSAGING_ROUTES.Chat,
                  initial: false,
                  params: { conversationId: conversation.id, otherUserName: listing.owner.full_name },
                });
              } catch (error) {
                Alert.alert('Could not open the conversation', errorMessage(error));
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

function makeStyles({ colors, space, radius, typography, size }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    content: {
      padding: space[4],
    },
    image: {
      width: '100%',
      height: size.photoHero,
      borderRadius: radius.md,
      backgroundColor: colors.line,
    },
    title: {
      marginTop: space[4],
      ...typography.headline,
      color: colors.ink,
    },
    price: {
      marginTop: space[1],
      ...typography.bodyStrong,
      color: colors.accent.brand.ink,
    },
    category: {
      marginTop: space[1],
      ...typography.caption,
      color: colors.ink2,
    },
    description: {
      marginTop: space[3],
      ...typography.body,
      color: colors.ink2,
    },
    sellerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: space[4],
      gap: space[2],
    },
    sellerName: {
      ...typography.caption,
      color: colors.ink,
    },
    action: {
      marginTop: space[6],
    },
    secondaryAction: {
      marginTop: space[3],
    },
    reviewsSection: {
      marginTop: space[6],
    },
    sectionTitle: {
      ...typography.bodyStrong,
      color: colors.ink,
      marginBottom: space[2],
    },
  });
}
