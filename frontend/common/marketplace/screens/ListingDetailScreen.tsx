import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Image, Pressable, StyleSheet, Text, View, useWindowDimensions, type ViewToken } from 'react-native';
import { ImageOff } from 'lucide-react-native';
import {
  Avatar,
  Button,
  ListGroup,
  ListRow,
  PhotoViewer,
  QuantityStepper,
  QueryState,
  RoleBadge,
  ScreenScaffold,
  StatusBadge,
  StickyActionBar,
  RatePlate,
  useSnackbar,
} from '../../components';
import { RatingSummary, ReviewCard, useListingReviews } from '../../reviews';
import { APP_TABS, MARKETPLACE_ROUTES, MESSAGING_ROUTES } from '../../constants/routes';
import { useListing, useRecordListingView } from '../hooks/marketplace';
import { useOpenConversation } from '../../messaging';
import { useAuthStore } from '../../../state/authStore';
import { useCartStore } from '../../../state/cartStore';
import { navigateInTab } from '../../../navigation/navigateInTab';
import { useAppTabNavigation } from '../../../navigation/stacks/useAppTabNavigation';
import { useTheme, type Theme } from '../../../theme';
import { errorMessage } from '../../../utils/errorMessage';
import { hapticTap } from '../../../utils/haptics';
import { formatRs } from '../../../utils/money';
import type { MarketplaceScreenProps } from '../../../navigation/stacks/MarketplaceNavigator';

/** Reviews shown before "Show all": enough to judge the seller without pushing the page past the buy bar. */
const REVIEWS_PREVIEW = 3;

/** A photo counts as the current one once most of it is in view. Constant: FlatList reads it once. */
const PAGER_VIEWABILITY = { itemVisiblePercentThreshold: 60 };

/** One listing: every photo in a pager ("1 of 4", tap for full screen), the price on its plate, who sells it, and a bar
 * that sets the quantity before Add to cart (MK-02, MK-07, MK-08). The seller sees Edit listing there instead. */
export function ListingDetailScreen({ route, navigation }: MarketplaceScreenProps<'ListingDetail'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { listingId } = route.params;
  const userId = useAuthStore(state => state.user?.id);
  const addItem = useCartStore(state => state.addItem);
  const tabs = useAppTabNavigation();
  const snackbar = useSnackbar();
  const query = useListing(listingId);
  const listing = query.data;
  const { data: reviews = [] } = useListingReviews(listingId);
  const openConversation = useOpenConversation();
  const { mutate: recordView } = useRecordListingView();
  const [quantity, setQuantity] = useState(1);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [viewing, setViewing] = useState(false);
  const [pagerWidth, setPagerWidth] = useState(0);
  const window = useWindowDimensions();

  const ownerId = listing?.owner_id;
  useEffect(() => {
    // Fire-and-forget: view tracking must not block or fail the render. Once per screen visit, not per refetch.
    if (userId && ownerId && ownerId !== userId) recordView(listingId);
  }, [listingId, ownerId, userId, recordView]);

  // The pager reports which photo is mostly in view; the handler must be stable for FlatList.
  const onViewable = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0]?.index;
    if (first !== null && first !== undefined) setPhotoIndex(first);
  }, []);

  const isOwner = listing?.owner_id === userId;
  const outOfStock = listing?.availability === 'out_of_stock';
  const photos = listing?.images ?? [];
  // Measured when laid out; the window's width until then (and in tests, which have no layout pass).
  const width = pagerWidth || window.width - theme.components.screen.margin * 2;

  const addToCart = () => {
    if (!listing) return;
    addItem(
      {
        listingId: listing.id,
        sellerId: listing.owner_id,
        title: listing.title,
        price: listing.price,
        unit: listing.unit,
        image: listing.images[0] ?? null,
      },
      quantity,
    );
    hapticTap();
    snackbar.show(`${quantity} × ${listing.title} added to cart`, {
      label: 'View cart',
      onPress: () => navigation.navigate(MARKETPLACE_ROUTES.Cart),
    });
  };

  const messageSeller = async () => {
    if (!userId || !listing?.owner) return;
    try {
      const conversation = await openConversation.mutateAsync(listing.owner_id);
      // On top of the conversation list, so Back and the Messages tab reach it (MK-01).
      navigateInTab(tabs, APP_TABS.Messages, MESSAGING_ROUTES.Chat, {
        conversationId: conversation.id,
        otherUserName: listing.owner.full_name,
      });
    } catch (error) {
      Alert.alert("Couldn't open the chat", errorMessage(error));
    }
  };

  const footer = listing ? (
    isOwner ? (
      <StickyActionBar>
        <Button label="Edit listing" size="lg" onPress={() => navigation.navigate(MARKETPLACE_ROUTES.EditListing, { listingId: listing.id })} />
      </StickyActionBar>
    ) : outOfStock ? undefined : (
      <StickyActionBar leading={<QuantityStepper value={quantity} onChange={setQuantity} unit={listing.unit} />}>
        <Button label={`Add to cart · ${formatRs(listing.price * quantity)}`} size="lg" onPress={addToCart} />
      </StickyActionBar>
    )
  ) : undefined;

  const city = listing?.location?.city;
  const visibleReviews = showAllReviews ? reviews : reviews.slice(0, REVIEWS_PREVIEW);

  return (
    <ScreenScaffold footer={footer} onRefresh={() => query.refetch()} refreshing={query.isRefetching}>
      <QueryState query={query} failureTitle="Couldn't load this listing">
        {listing ? (
          <>
            <View onLayout={event => setPagerWidth(event.nativeEvent.layout.width)}>
              {photos.length > 0 ? (
                <>
                  <FlatList
                    data={photos}
                    keyExtractor={uri => uri}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onViewableItemsChanged={onViewable}
                    viewabilityConfig={PAGER_VIEWABILITY}
                    getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
                    renderItem={({ item, index }) => (
                      <Pressable
                        style={{ width }}
                        onPress={() => {
                          setPhotoIndex(index);
                          setViewing(true);
                        }}
                        accessibilityRole="imagebutton"
                        accessibilityLabel={`Photo ${index + 1} of ${photos.length}`}
                        accessibilityHint="Opens the photos full screen"
                      >
                        <Image source={{ uri: item }} style={styles.photo} resizeMode="cover" accessibilityIgnoresInvertColors />
                      </Pressable>
                    )}
                  />
                  {photos.length > 1 ? (
                    <View style={styles.counter} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                      <Text style={styles.counterText}>{`${Math.min(photoIndex + 1, photos.length)} of ${photos.length}`}</Text>
                    </View>
                  ) : null}
                </>
              ) : (
                <View style={[styles.photo, styles.noPhoto]} accessible accessibilityLabel="No photo">
                  <ImageOff color={theme.colors.ink3} size={theme.size.iconLg} />
                </View>
              )}
            </View>

            <View style={styles.head}>
              <Text style={styles.title} accessibilityRole="header">
                {listing.title}
              </Text>
              <RatePlate amount={listing.price} unit={`per ${listing.unit}`} size="xl" />
              <View style={styles.badges}>
                {listing.availability ? <StatusBadge kind="stock" status={listing.availability} /> : null}
                {listing.seller_role ? <RoleBadge role={listing.seller_role} /> : null}
                {city ? <Text style={styles.town}>{city}</Text> : null}
              </View>
            </View>

            {listing.owner ? (
              <ListGroup>
                <ListRow
                  title={listing.owner.full_name || 'Seller'}
                  meta={city ?? undefined}
                  leading={<Avatar name={listing.owner.full_name} uri={listing.owner.avatar_url} size={theme.size.avatarMd} />}
                />
              </ListGroup>
            ) : null}

            {listing.brand || listing.condition || listing.crop_compatibility.length > 0 || listing.category ? (
              <ListGroup>
                {listing.category ? <ListRow title={listing.category.name} meta="Category" /> : null}
                {listing.brand ? <ListRow title={listing.brand} meta="Brand" /> : null}
                {listing.condition ? <ListRow title={listing.condition} meta="Condition" /> : null}
                {listing.crop_compatibility.length > 0 ? <ListRow title={listing.crop_compatibility.join(', ')} meta="Suits" /> : null}
              </ListGroup>
            ) : null}

            {listing.description ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle} accessibilityRole="header">
                  About this listing
                </Text>
                <Text style={styles.description}>{listing.description}</Text>
              </View>
            ) : null}

            {!isOwner && listing.owner ? (
              <Button label="Message seller" variant="secondary" loading={openConversation.isPending} onPress={messageSeller} />
            ) : null}

            <View style={styles.section}>
              <Text style={styles.sectionTitle} accessibilityRole="header">
                Reviews
              </Text>
              <RatingSummary reviews={reviews} />
              {visibleReviews.map(review => (
                <ReviewCard key={review.id} review={review} />
              ))}
              {reviews.length > REVIEWS_PREVIEW && !showAllReviews ? (
                <Button label={`Show all ${reviews.length} reviews`} variant="quiet" onPress={() => setShowAllReviews(true)} />
              ) : null}
            </View>

            {photos.length > 0 ? (
              <PhotoViewer visible={viewing} onClose={() => setViewing(false)} photos={photos.map(uri => ({ uri }))} initialIndex={photoIndex} />
            ) : null}
          </>
        ) : null}
      </QueryState>
    </ScreenScaffold>
  );
}

function makeStyles({ colors, space, radius, size, typography }: Theme) {
  return StyleSheet.create({
    photo: { width: '100%', height: size.photoHero, borderRadius: radius.md, backgroundColor: colors.surfaceSunken },
    noPhoto: { alignItems: 'center', justifyContent: 'center' },
    counter: {
      position: 'absolute',
      right: space[2],
      bottom: space[2],
      paddingHorizontal: space[2],
      paddingVertical: space[1],
      borderRadius: radius.xs,
      backgroundColor: colors.ink,
    },
    counterText: { ...typography.label, color: colors.surface },
    head: { gap: space[3] },
    title: { ...typography.titleLg, color: colors.ink },
    badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] },
    town: { ...typography.caption, color: colors.ink2 },
    section: { gap: space[2] },
    sectionTitle: { ...typography.title, color: colors.ink },
    description: { ...typography.body, color: colors.ink },
  });
}
