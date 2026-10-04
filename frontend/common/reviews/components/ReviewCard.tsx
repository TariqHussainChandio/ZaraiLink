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
        <Avatar name={review.buyer?.full_name} uri={review.buyer?.avatar_url} size={theme.size.avatarSm} />
        <View style={styles.headerText}>
          <Text style={styles.name}>{review.buyer?.full_name || 'Unknown buyer'}</Text>
          <Text style={styles.date}>{new Date(review.created_at).toLocaleDateString()}</Text>
        </View>
        <RatingStars value={review.rating} />
      </View>
      {review.comment ? <Text style={styles.comment}>{review.comment}</Text> : null}
    </Card>
  );
}

function makeStyles({ colors, space, typography, fontWeight }: Theme) {
  return StyleSheet.create({
    card: {
      marginBottom: space[3],
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
    },
    headerText: {
      flex: 1,
    },
    name: {
      ...typography.caption,
      fontWeight: fontWeight.semibold,
      color: colors.ink,
    },
    date: {
      ...typography.caption,
      color: colors.ink2,
    },
    comment: {
      marginTop: space[2],
      ...typography.caption,
      color: colors.ink2,
    },
  });
}
