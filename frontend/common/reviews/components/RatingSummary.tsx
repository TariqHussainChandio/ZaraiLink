import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RatingStars } from './RatingStars';
import { useTheme, type Theme } from '../../../theme';
import type { Review } from '../types/reviews';

export interface RatingSummaryProps {
  reviews: Review[];
}

export function RatingSummary({ reviews }: RatingSummaryProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

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

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[1],
    },
    text: {
      ...typography.caption,
      color: colors.ink2,
    },
    empty: {
      ...typography.caption,
      color: colors.ink2,
    },
  });
}
