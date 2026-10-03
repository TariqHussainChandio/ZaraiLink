import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, TextField } from '../../components';
import { RatingStars } from '../components/RatingStars';
import { useCreateReview } from '../hooks/reviews';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';
import type { OrdersScreenProps } from '../../../navigation/stacks/OrdersNavigator';
import { errorMessage } from '../../../utils/errorMessage';

export function WriteReviewScreen({ route, navigation }: OrdersScreenProps<'WriteReview'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { orderId, listingId } = route.params;
  const buyerId = useAuthStore(state => state.user?.id);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const createReview = useCreateReview();

  const onSubmit = async () => {
    if (!buyerId) return;
    try {
      await createReview.mutateAsync({ orderId, listingId, rating, comment: comment || null });
      navigation.goBack();
    } catch (error) {
      Alert.alert('Could not submit review', errorMessage(error));
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Your rating</Text>
      <View style={styles.starsRow}>
        <RatingStars value={rating} size={theme.size.iconLg} onChange={setRating} />
      </View>

      <TextField
        label="Comment (optional)"
        placeholder="How was your experience?"
        value={comment}
        onChangeText={setComment}
        multiline
        numberOfLines={4}
      />

      <Button
        label="Submit Review"
        loading={createReview.isPending}
        onPress={onSubmit}
        style={styles.submit}
      />
    </ScrollView>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    content: {
      padding: space[4],
    },
    label: {
      ...typography.caption,
      color: colors.ink2,
      marginBottom: space[2],
    },
    starsRow: {
      marginBottom: space[4],
    },
    submit: {
      marginTop: space[3],
    },
  });
}
