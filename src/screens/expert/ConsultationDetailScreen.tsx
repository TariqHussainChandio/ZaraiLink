import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import type { Asset } from 'react-native-image-picker';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button, Card, Input, SelectField, Sheet, Spinner } from '../../components/ui';
import { ConsultationStatusBadge } from '../../components/features/expert/ConsultationStatusBadge';
import { ConsultationMessageBubble } from '../../components/features/expert/ConsultationMessageBubble';
import { ChatInput } from '../../components/features/messaging/ChatInput';
import { RatingStars } from '../../components/features/reviews/RatingStars';
import { APP_TABS, MARKETPLACE_ROUTES } from '../../constants/routes';
import {
  fetchConsultationById,
  fetchConsultationMessages,
  resolveConsultationAttachmentUrls,
  sendConsultationMessage,
  updateConsultationStatus,
  uploadConsultationAttachments,
} from '../../services/modules/expert/consultationService';
import { fetchListings } from '../../services/modules/marketplace/listingsService';
import { createConsultationReview, fetchReviewByConsultationId } from '../../services/modules/reviews/reviewsService';
import { useAuthStore } from '../../store/authStore';
import { useRealtimeConsultationMessages } from '../../hooks/realtime/useRealtimeConsultationMessages';
import { useTheme, type Theme } from '../../theme';
import type { ConsultationMessageWithListing, ConsultationStatus, ConsultationWithRelations } from '../../types/expert';
import type { ReviewWithBuyer } from '../../types/reviews';

export function ConsultationDetailScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { consultationId } = useRoute().params as { consultationId: string };
  const navigation = useNavigation<any>();
  const userId = useAuthStore(state => state.user?.id);

  const [consultation, setConsultation] = useState<ConsultationWithRelations | null>(null);
  const [messages, setMessages] = useState<ConsultationMessageWithListing[]>([]);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const [review, setReview] = useState<ReviewWithBuyer | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [sending, setSending] = useState(false);

  const [recommendVisible, setRecommendVisible] = useState(false);
  const [listingOptions, setListingOptions] = useState<{ id: string; title: string }[]>([]);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);

  const [reviewVisible, setReviewVisible] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const resolveUrls = useCallback(async (paths: string[]) => {
    if (paths.length === 0) return;
    const resolved = await resolveConsultationAttachmentUrls(paths);
    setAttachmentUrls(current => ({ ...current, ...resolved }));
  }, []);

  const load = useCallback(async () => {
    const [data, messageData, reviewData] = await Promise.all([
      fetchConsultationById(consultationId),
      fetchConsultationMessages(consultationId),
      fetchReviewByConsultationId(consultationId),
    ]);
    setConsultation(data);
    setMessages(messageData);
    setReview(reviewData);
    setLoading(false);
    resolveUrls([...data.images, ...messageData.flatMap(m => m.attachments)]);
  }, [consultationId, resolveUrls]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useRealtimeConsultationMessages(consultationId, incoming => {
    setMessages(prev => (prev.some(m => m.id === incoming.id) ? prev : [...prev, incoming as ConsultationMessageWithListing]));
    resolveUrls(incoming.attachments);
  });

  if (loading || !consultation) return <Spinner fullscreen />;

  const isRequester = consultation.user_id === userId;
  const isExpert = consultation.expert_id === userId;
  const counterpartyName = (isRequester ? consultation.expert?.full_name : consultation.user?.full_name) ?? 'Unknown';

  const advance = async (to: ConsultationStatus) => {
    setUpdating(true);
    try {
      await updateConsultationStatus(consultation.id, to);
      await load();
    } catch (error) {
      Alert.alert('Could not update consultation', error instanceof Error ? error.message : String(error));
    } finally {
      setUpdating(false);
    }
  };

  const onSend = async (body: string, images: Asset[]) => {
    if (!userId) return;
    setSending(true);
    try {
      const attachments = images.length > 0 ? await uploadConsultationAttachments(consultationId, userId, images) : [];
      const message = await sendConsultationMessage(consultationId, body, attachments);
      setMessages(prev => (prev.some(m => m.id === message.id) ? prev : [...prev, message]));
      resolveUrls(attachments);
    } finally {
      setSending(false);
    }
  };

  const openRecommend = async () => {
    if (listingOptions.length === 0) {
      const listings = await fetchListings({});
      setListingOptions(listings.map(l => ({ id: l.id, title: l.title })));
    }
    setRecommendVisible(true);
  };

  const onSendRecommendation = async () => {
    if (!userId || !selectedListingId) return;
    setSending(true);
    try {
      const title = listingOptions.find(l => l.id === selectedListingId)?.title ?? 'this product';
      const message = await sendConsultationMessage(consultationId, `Recommended: ${title}`, [], selectedListingId);
      setMessages(prev => [...prev, message]);
      setRecommendVisible(false);
      setSelectedListingId(null);
    } finally {
      setSending(false);
    }
  };

  const onSubmitReview = async () => {
    if (!userId || !consultation.expert_id) return;
    setSubmittingReview(true);
    try {
      const created = await createConsultationReview(consultation.id, reviewRating, reviewComment || null);
      setReview({ ...created, buyer: null });
      setReviewVisible(false);
    } catch (error) {
      Alert.alert('Could not submit review', error instanceof Error ? error.message : String(error));
    } finally {
      setSubmittingReview(false);
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
        <FlatList
          data={[...messages].reverse()}
          inverted
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
          ListFooterComponent={
            <View style={styles.details}>
              <View style={styles.headerRow}>
                <Text style={styles.subject}>{consultation.subject}</Text>
                <ConsultationStatusBadge status={consultation.status} />
              </View>
              <Text style={styles.meta}>With {counterpartyName}</Text>
              {consultation.crop ? <Text style={styles.meta}>Crop: {consultation.crop.name}</Text> : null}
              <Text style={styles.meta}>Priority: {consultation.priority}</Text>
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
                {canAccept ? <Button label="Accept" loading={updating} onPress={() => advance('accepted')} style={styles.action} /> : null}
                {canReject ? (
                  <Button label="Reject" variant="destructive" loading={updating} onPress={() => advance('rejected')} style={styles.action} />
                ) : null}
                {canStart ? <Button label="Start Working" loading={updating} onPress={() => advance('in_progress')} style={styles.action} /> : null}
                {canResolve ? <Button label="Mark Resolved" loading={updating} onPress={() => advance('resolved')} style={styles.action} /> : null}
                {canCancel ? (
                  <Button label="Cancel Request" variant="destructive" loading={updating} onPress={() => advance('cancelled')} style={styles.action} />
                ) : null}
                {canClose ? <Button label="Close Consultation" loading={updating} onPress={() => advance('closed')} style={styles.action} /> : null}
                {canReview ? (
                  <Button label="Write a Review" variant="secondary" onPress={() => setReviewVisible(true)} style={styles.action} />
                ) : null}
                {isExpert ? (
                  <Button label="Recommend a Product" variant="secondary" onPress={openRecommend} style={styles.action} />
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
        <Input label="Comment (optional)" value={reviewComment} onChangeText={setReviewComment} multiline numberOfLines={3} />
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
      fontWeight: typography.weights.bold as any,
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
      fontWeight: typography.weights.semibold as any,
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
      fontWeight: typography.weights.semibold as any,
      color: colors.text.primary,
      marginBottom: spacing.md,
    },
    starsRow: {
      marginBottom: spacing.md,
    },
  });
}
