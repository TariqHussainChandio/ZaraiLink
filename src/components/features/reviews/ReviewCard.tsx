import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Avatar, Card } from '../../ui';
import { RatingStars } from './RatingStars';
import { lightTheme } from '../../../theme';
import type { ReviewWithBuyer } from '../../../types/reviews';

const { colors, spacing, typography } = lightTheme;

export function ReviewCard({ review }: { review: ReviewWithBuyer }) {
  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Avatar name={review.buyer?.full_name} uri={review.buyer?.avatar_url} size={32} />
        <View style={styles.headerText}>
          <Text style={styles.name}>{review.buyer?.full_name ?? 'Unknown buyer'}</Text>
          <Text style={styles.date}>{new Date(review.created_at).toLocaleDateString()}</Text>
        </View>
        <RatingStars value={review.rating} />
      </View>
      {review.comment ? <Text style={styles.comment}>{review.comment}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerText: {
    flex: 1,
  },
  name: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold as any,
    color: colors.neutral.gray900,
  },
  date: {
    fontSize: typography.sizes.xs,
    color: colors.neutral.gray500,
  },
  comment: {
    marginTop: spacing.sm,
    fontSize: typography.sizes.sm,
    color: colors.neutral.gray700,
    lineHeight: typography.lineHeights.sm,
  },
});
