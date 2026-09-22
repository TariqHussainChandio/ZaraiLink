import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Input } from '../../components/ui';
import { RatingStars } from '../../components/features/reviews/RatingStars';
import { createReview } from '../../services/modules/reviews/reviewsService';
import { useAuthStore } from '../../store/authStore';
import { useTheme, type Theme } from '../../theme';
import type { OrdersScreenProps } from '../../navigation/stacks/OrdersNavigator';

export function WriteReviewScreen({ route, navigation }: OrdersScreenProps<'WriteReview'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { t } = useTranslation();
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
      Alert.alert(t('reviews.writeReview.errorTitle'), error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>{t('reviews.writeReview.ratingLabel')}</Text>
      <View style={styles.starsRow}>
        <RatingStars value={rating} size={32} onChange={setRating} />
      </View>

      <Input
        label={t('reviews.writeReview.commentLabel')}
        placeholder={t('reviews.writeReview.commentPlaceholder')}
        value={comment}
        onChangeText={setComment}
        multiline
        numberOfLines={4}
      />

      <Button
        label={t('reviews.writeReview.submitButton')}
        loading={submitting}
        onPress={onSubmit}
        style={styles.submit}
      />
    </ScrollView>
  );
}

function makeStyles({ colors, spacing, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.surface,
    },
    content: {
      padding: spacing.lg,
    },
    label: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.medium as any,
      color: colors.text.secondary,
      marginBottom: spacing.sm,
    },
    starsRow: {
      marginBottom: spacing.lg,
    },
    submit: {
      marginTop: spacing.md,
    },
  });
}
