import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Input } from '../../components/ui';
import { RatingStars } from '../../components/features/reviews/RatingStars';
import { createReview } from '../../services/modules/reviews/reviewsService';
import { useAuthStore } from '../../store/authStore';
import { lightTheme } from '../../theme';
import type { OrdersScreenProps } from '../../navigation/stacks/OrdersNavigator';

const { colors, spacing, typography } = lightTheme;

export function WriteReviewScreen({ route, navigation }: OrdersScreenProps<'WriteReview'>) {
  const { orderId, listingId } = route.params;
  const buyerId = useAuthStore(state => state.user?.id);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    if (!buyerId) return;
    setSubmitting(true);
    try {
      await createReview(orderId, listingId, rating, comment || null);
      navigation.goBack();
    } catch (error) {
      Alert.alert('Could not submit review', error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Your rating</Text>
      <View style={styles.starsRow}>
        <RatingStars value={rating} size={32} onChange={setRating} />
      </View>

      <Input
        label="Comment (optional)"
        placeholder="How was your experience?"
        value={comment}
        onChangeText={setComment}
        multiline
        numberOfLines={4}
      />

      <Button label="Submit Review" loading={submitting} onPress={onSubmit} style={styles.submit} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
  },
  content: {
    padding: spacing.lg,
  },
  label: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium as any,
    color: colors.neutral.gray700,
    marginBottom: spacing.sm,
  },
  starsRow: {
    marginBottom: spacing.lg,
  },
  submit: {
    marginTop: spacing.md,
  },
});
