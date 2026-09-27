import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import type { PickedPhoto } from '../../utils/photoPicker';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Button, Card, Input, SelectField, Sheet, Spinner } from '../../components/ui';
import { ConsultationStatusBadge } from '../../components/features/expert/ConsultationStatusBadge';
import { ConsultationMessageBubble } from '../../components/features/expert/ConsultationMessageBubble';
import { ChatInput } from '../../components/features/messaging/ChatInput';
import { RatingStars } from '../../components/features/reviews/RatingStars';
import { APP_TABS, MARKETPLACE_ROUTES } from '../../constants/routes';
import {
  useConsultation,
  useConsultationAttachmentUrls,
  useConsultationMessages,
  useConsultationReview,
  useCreateConsultationReview,
  useSendConsultationMessage,
  useUpdateConsultationStatus,
} from '../../hooks/api/consultations';
import { useListingOptions } from '../../hooks/api/marketplace';
import { useAuthStore } from '../../store/authStore';
import { useTheme, type Theme } from '../../theme';
import type { ConsultationStatus } from '../../types/expert';
import { errorMessage } from '../../utils/errorMessage';

export function ConsultationDetailScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { consultationId } = useRoute().params as { consultationId: string };
  const navigation = useNavigation<any>();
  const userId = useAuthStore(state => state.user?.id);

  const consultationQuery = useConsultation(consultationId);
  const messagesQuery = useConsultationMessages(consultationId);
  const reviewQuery = useConsultationReview(consultationId);
  const consultation = consultationQuery.data;
  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);
  const review = reviewQuery.data ?? null;
  const loading = consultationQuery.isPending || messagesQuery.isPending;
  const attachmentPaths = useMemo(
    () => [...(consultation?.images ?? []), ...messages.flatMap(m => m.attachments)],
    [consultation, messages],
  );
  const { data: attachmentUrls = {} } = useConsultationAttachmentUrls(attachmentPaths);

  const statusMutation = useUpdateConsultationStatus(consultationId);
  const send = useSendConsultationMessage(consultationId, userId);
  const reviewMutation = useCreateConsultationReview(consultationId);
  const updating = statusMutation.isPending;
  const sending = send.isPending;
  const submittingReview = reviewMutation.isPending;

  const [recommendVisible, setRecommendVisible] = useState(false);
  const { data: listingOptions = [] } = useListingOptions(recommendVisible);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [reviewVisible, setReviewVisible] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');

  // Coming back to the consultation shows a status change or messages that arrived meanwhile.
  const { refetch: refetchConsultation } = consultationQuery;
  const { refetch: refetchMessages } = messagesQuery;
  const { refetch: refetchReview } = reviewQuery;
  useFocusEffect(
    useCallback(() => {
      refetchConsultation();
      refetchMessages();
      refetchReview();
    }, [refetchConsultation, refetchMessages, refetchReview]),
  );

  if (loading || !consultation) return <Spinner fullscreen />;

  const isRequester = consultation.user_id === userId;
  const isExpert = consultation.expert_id === userId;
  const counterpartyName =
    (isRequester ? consultation.expert?.full_name : consultation.user?.full_name) ??
    'Unknown';

  const advance = async (to: ConsultationStatus) => {
    try {
      await statusMutation.mutateAsync(to);
    } catch (error) {
      Alert.alert('Could not update consultation', errorMessage(error));
    }
  };

  const onSend = async (body: string, images: PickedPhoto[]) => {
    if (!userId) return;
    await send.mutateAsync({ body, images });
  };

  const openRecommend = () => setRecommendVisible(true);

  const onSendRecommendation = async () => {
    if (!userId || !selectedListingId) return;
    const title =
      listingOptions.find(l => l.id === selectedListingId)?.title ?? 'this product';
    try {
      await send.mutateAsync({
        body: `Recommended: ${title}`,
        recommendedListingId: selectedListingId,
      });
      setRecommendVisible(false);
      setSelectedListingId(null);
    } catch (error) {
      Alert.alert('Could not send the recommendation', errorMessage(error));
    }
  };

  const onSubmitReview = async () => {
    if (!userId || !consultation.expert_id) return;
    try {
      await reviewMutation.mutateAsync({ rating: reviewRating, comment: reviewComment || null });
      setReviewVisible(false);
    } catch (error) {
      Alert.alert('Could not submit review', errorMessage(error));
    }
  };

  const canAccept = isExpert && consultation.status === 'requested';
  const canReject = isExpert && consultation.status === 'requested';
  const canStart = isExpert && consultation.status === 'accepted';
  const canResolve = isExpert && consultation.status === 'in_progress';
  const canCancel = isRequester && ['requested', 'accepted'].includes(consultation.status);
  const canClose = isRequester && consultation.status === 'resolved';
  const canReview = isRequester && consultation.status === 'resolved' && !review;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <View style={styles.flex}>
        <FlashList
          data={messages}
          // FlashList v2 has no `inverted`: the newest message is at the bottom and the list starts and follows there.
          maintainVisibleContentPosition={{ startRenderingFromBottom: true, autoscrollToBottomThreshold: 0.2 }}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <ConsultationMessageBubble
              message={item}
              isOwn={item.sender_id === userId}
              attachmentUrls={attachmentUrls}
              onPressRecommendation={listingId =>
                navigation
                  .getParent?.()
                  ?.navigate(APP_TABS.Marketplace, { screen: MARKETPLACE_ROUTES.ListingDetail, params: { listingId } })
              }
            />
          )}
          ListHeaderComponent={
            <View style={styles.details}>
              <View style={styles.headerRow}>
                <Text style={styles.subject}>{consultation.subject}</Text>
                <ConsultationStatusBadge status={consultation.status} />
              </View>
              <Text style={styles.meta}>
                {`With ${counterpartyName}`}
              </Text>
              {consultation.crop ? (
                <Text style={styles.meta}>
                  {`Crop: ${consultation.crop.name}`}
                </Text>
              ) : null}
              <Text style={styles.meta}>
                {`Priority: ${consultation.priority}`}
              </Text>
              {consultation.problem_description ? (
                <Card style={styles.descriptionCard}>
                  <Text style={styles.description}>{consultation.problem_description}</Text>
                </Card>
              ) : null}
              {consultation.images.length > 0 ? (
                <View style={styles.imageRow}>
                  {consultation.images.map(path =>
                    attachmentUrls[path] ? (
                      <Image key={path} source={{ uri: attachmentUrls[path] }} style={styles.image} />
                    ) : null,
                  )}
                </View>
              ) : null}

              {review ? (
                <Card style={styles.reviewCard}>
                  <Text style={styles.reviewTitle}>Your Review</Text>
                  <RatingStars value={review.rating} />
                  {review.comment ? <Text style={styles.description}>{review.comment}</Text> : null}
                </Card>
              ) : null}

              <View style={styles.actions}>
                {canAccept ? (
                  <Button
                    label="Accept"
                    loading={updating}
                    onPress={() => advance('accepted')}
                    style={styles.action}
                  />
                ) : null}
                {canReject ? (
                  <Button
                    label="Reject"
                    variant="destructive"
                    loading={updating}
                    onPress={() => advance('rejected')}
                    style={styles.action}
                  />
                ) : null}
                {canStart ? (
                  <Button
                    label="Start Working"
                    loading={updating}
                    onPress={() => advance('in_progress')}
                    style={styles.action}
                  />
                ) : null}
                {canResolve ? (
                  <Button
                    label="Mark Resolved"
                    loading={updating}
                    onPress={() => advance('resolved')}
                    style={styles.action}
                  />
                ) : null}
                {canCancel ? (
                  <Button
                    label="Cancel Request"
                    variant="destructive"
                    loading={updating}
                    onPress={() => advance('cancelled')}
                    style={styles.action}
                  />
                ) : null}
                {canClose ? (
                  <Button
                    label="Close Consultation"
                    loading={updating}
                    onPress={() => advance('closed')}
                    style={styles.action}
                  />
                ) : null}
                {canReview ? (
                  <Button
                    label="Write a Review"
                    variant="secondary"
                    onPress={() => setReviewVisible(true)}
                    style={styles.action}
                  />
                ) : null}
                {isExpert ? (
                  <Button
                    label="Recommend a Product"
                    variant="secondary"
                    onPress={openRecommend}
                    style={styles.action}
                  />
                ) : null}
              </View>
            </View>
          }
        />
        <ChatInput onSend={onSend} sending={sending} />
      </View>

      <Sheet visible={recommendVisible} onClose={() => setRecommendVisible(false)}>
        <Text style={styles.sheetTitle}>Recommend a Product</Text>
        <SelectField
          label="Listing"
          value={selectedListingId}
          options={listingOptions.map(l => ({ id: l.id, label: l.title }))}
          onSelect={setSelectedListingId}
        />
        <Button label="Send Recommendation" loading={sending} onPress={onSendRecommendation} />
      </Sheet>

      <Sheet visible={reviewVisible} onClose={() => setReviewVisible(false)}>
        <Text style={styles.sheetTitle}>Rate this Consultation</Text>
        <View style={styles.starsRow}>
          <RatingStars value={reviewRating} size={28} onChange={setReviewRating} />
        </View>
        <Input
          label="Comment (optional)"
          value={reviewComment}
          onChangeText={setReviewComment}
          multiline
          numberOfLines={3}
        />
        <Button label="Submit Review" loading={submittingReview} onPress={onSubmitReview} />
      </Sheet>
    </KeyboardAvoidingView>
  );
}

function makeStyles({ colors, spacing, radii, typography }: Theme) {
  return StyleSheet.create({
    flex: {
      flex: 1,
      backgroundColor: colors.background.surface,
    },
    list: {
      paddingVertical: spacing.md,
    },
    details: {
      padding: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.xs,
    },
    subject: {
      flex: 1,
      marginRight: spacing.sm,
      fontSize: typography.sizes.lg,
      fontWeight: typography.weights.bold,
      color: colors.text.primary,
    },
    meta: {
      fontSize: typography.sizes.sm,
      color: colors.text.secondary,
      marginBottom: spacing.xs / 2,
    },
    descriptionCard: {
      marginTop: spacing.sm,
    },
    description: {
      fontSize: typography.sizes.sm,
      color: colors.text.primary,
      lineHeight: typography.lineHeights.sm,
    },
    imageRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    image: {
      width: 80,
      height: 80,
      borderRadius: radii.md,
      backgroundColor: colors.border,
    },
    reviewCard: {
      marginTop: spacing.md,
    },
    reviewTitle: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.semibold,
      color: colors.text.secondary,
      marginBottom: spacing.xs,
    },
    actions: {
      marginTop: spacing.md,
    },
    action: {
      marginTop: spacing.sm,
    },
    sheetTitle: {
      fontSize: typography.sizes.lg,
      fontWeight: typography.weights.semibold,
      color: colors.text.primary,
      marginBottom: spacing.md,
    },
    starsRow: {
      marginBottom: spacing.md,
    },
  });
}
