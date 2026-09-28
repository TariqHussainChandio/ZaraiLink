import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Avatar, Card } from '../../components';
import { RatingStars } from './RatingStars';
import { useTheme, type Theme } from '../../../theme';
import type { ReviewWithBuyer } from '../types/reviews';

export function ReviewCard({ review }: { review: ReviewWithBuyer }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

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

function makeStyles({ colors, spacing, typography }: Theme) {
  return StyleSheet.create({
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
      fontWeight: typography.weights.semibold,
      color: colors.text.primary,
    },
    date: {
      fontSize: typography.sizes.xs,
      color: colors.text.secondary,
    },
    comment: {
      marginTop: spacing.sm,
      fontSize: typography.sizes.sm,
      color: colors.text.secondary,
      lineHeight: typography.lineHeights.sm,
    },
  });
}
