import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Banner, Button, Card, ScreenScaffold, StickyActionBar, TextField, useSnackbar } from '../../components';
import { useOrderDetail } from '../../orders';
import { RatingStars } from '../components/RatingStars';
import { useCreateReview } from '../hooks/reviews';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';
import type { OrdersScreenProps } from '../../../navigation/stacks/OrdersNavigator';
import { errorMessage } from '../../../utils/errorMessage';

/** Rate an order. It starts unrated (a default of five stars made an unconsidered review the easy one) and Submit waits for
 * a rating. The header says what is being reviewed. */
export function WriteReviewScreen({ route, navigation }: OrdersScreenProps<'WriteReview'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { orderId, listingId } = route.params;
  const buyerId = useAuthStore(state => state.user?.id);
  const snackbar = useSnackbar();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const createReview = useCreateReview();
  const order = useOrderDetail(orderId).data?.order;
  const item = order?.order_items.find(candidate => candidate.listing_id === listingId) ?? order?.order_items[0];

  const onSubmit = async () => {
    if (!buyerId || rating === 0) return;
    setFailure(null);
    try {
      await createReview.mutateAsync({ orderId, listingId, rating, comment: comment.trim() || null });
      snackbar.show('Review submitted');
      navigation.goBack();
    } catch (error) {
      setFailure(errorMessage(error));
    }
  };

  return (
    <ScreenScaffold
      footer={
        <StickyActionBar>
          <Button label="Submit review" size="lg" disabled={rating === 0} loading={createReview.isPending} onPress={onSubmit} />
        </StickyActionBar>
      }
    >
      {failure ? (
        <Banner tone="danger" title="Couldn't submit your review">
          {failure}
        </Banner>
      ) : null}
      {item ? (
        <Card style={styles.subject}>
          <Text style={styles.item}>{item.listing?.title ?? 'Your order'}</Text>
          {order?.seller?.full_name ? <Text style={styles.seller}>{`from ${order.seller.full_name}`}</Text> : null}
        </Card>
      ) : null}
      <View style={styles.rating}>
        <Text style={styles.label}>Your rating</Text>
        <RatingStars value={rating} size={theme.size.iconLg} onChange={setRating} />
        {rating === 0 ? <Text style={styles.hint}>Tap a star to rate.</Text> : null}
      </View>
      <TextField
        label="Comment"
        optional
        placeholder="How was your experience?"
        value={comment}
        onChangeText={setComment}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
      />
    </ScreenScaffold>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    subject: { gap: space[1] },
    item: { ...typography.bodyStrong, color: colors.ink },
    seller: { ...typography.caption, color: colors.ink2 },
    rating: { gap: space[2] },
    label: { ...typography.label, color: colors.ink },
    hint: { ...typography.caption, color: colors.ink3 },
  });
}
