import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RatingStars } from './RatingStars';
import { lightTheme } from '../../../theme';
import type { Review } from '../../../types/reviews';

export interface RatingSummaryProps {
  reviews: Review[];
}

const { colors, spacing, typography } = lightTheme;

export function RatingSummary({ reviews }: RatingSummaryProps) {
  const { average, count } = useMemo(() => {
    if (reviews.length === 0) return { average: 0, count: 0 };
    const total = reviews.reduce((sum, review) => sum + review.rating, 0);
    return { average: total / reviews.length, count: reviews.length };
  }, [reviews]);

  if (count === 0) {
    return <Text style={styles.empty}>No reviews yet</Text>;
  }

  return (
    <View style={styles.row}>
      <RatingStars value={average} />
      <Text style={styles.text}>
        {average.toFixed(1)} ({count} review{count === 1 ? '' : 's'})
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  text: {
    fontSize: typography.sizes.sm,
    color: colors.neutral.gray600,
  },
  empty: {
    fontSize: typography.sizes.sm,
    color: colors.neutral.gray400,
  },
});
