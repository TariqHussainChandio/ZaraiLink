import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Avatar, Banner, Card } from '../../components';
import { RatingStars } from './RatingStars';
import { useTheme, type Theme } from '../../../theme';
import type { ReviewWithBuyer } from '../types/reviews';

/**
 * One review. A hidden one reaches only its author (on their own order) and the admin (SRDS §14), so it says so: the
 * author learns why it is gone from the public pages instead of wondering, and is not offered to write it again.
 */
export function ReviewCard({ review }: { review: ReviewWithBuyer }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <Card style={styles.card}>
      {review.hidden_at ? (
        <View style={styles.hidden}>
          <Banner tone="warning" title="Hidden by a moderator">
            {`Others no longer see this review, and it does not count in ratings.${
              review.hidden_reason ? ` Reason: ${review.hidden_reason}` : ''
            }`}
          </Banner>
        </View>
      ) : null}
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
    hidden: {
      marginBottom: space[2],
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
