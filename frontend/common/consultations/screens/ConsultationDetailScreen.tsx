import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { Ban, Check, CircleCheck, ClipboardList, FileQuestion, Lock, Play, Send, ShoppingBag, Star, X } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import type { PickedPhoto } from '../../../utils/photoPicker';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import {
  Button,
  Card,
  ScreenState,
  SelectField,
  Sheet,
  SkeletonCard,
  SkeletonList,
  StatusBadge,
  TextField,
  useToast,
} from '../../components';
import { AddAssessmentSheet } from '../components/AddAssessmentSheet';
import { AiAssessmentCard } from '../components/AiAssessmentCard';
import { ConsultationMessageBubble } from '../components/ConsultationMessageBubble';
import { ExpertAssessmentPanel } from '../components/ExpertAssessmentPanel';
import { ChatInput } from '../../messaging';
import { RatingStars } from '../../reviews';
import { APP_TABS, MARKETPLACE_ROUTES } from '../../constants/routes';
import {
  useConsultation,
  useConsultationAssessments,
  useConsultationAttachmentUrls,
  useConsultationMessages,
  useConsultationReview,
  useCreateConsultationReview,
  useSendConsultationMessage,
  useUpdateConsultationStatus,
} from '../hooks/consultations';
import { useListingOptions } from '../../marketplace';
import { useComposerInsets } from '../../../hooks/useComposerInsets';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';
import type { ConsultationStatus } from '../../../expert';
import { errorMessage } from '../../../utils/errorMessage';

export function ConsultationDetailScreen() {
  const theme = useTheme();
  const composer = useComposerInsets();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { consultationId } = useRoute().params as { consultationId: string };
  const navigation = useNavigation<any>();
  const userId = useAuthStore(state => state.user?.id);
  const toast = useToast();

  const consultationQuery = useConsultation(consultationId);
  const messagesQuery = useConsultationMessages(consultationId);
  const reviewQuery = useConsultationReview(consultationId);
  const assessmentsQuery = useConsultationAssessments(consultationId);
  const consultation = consultationQuery.data;
  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);
  const review = reviewQuery.data ?? null;
  const assessments = assessmentsQuery.data ?? [];
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
  const [assessmentVisible, setAssessmentVisible] = useState(false);

  // Coming back to the consultation shows a status change or messages that arrived meanwhile.
  const { refetch: refetchConsultation } = consultationQuery;
  const { refetch: refetchMessages } = messagesQuery;
  const { refetch: refetchReview } = reviewQuery;
  const { refetch: refetchAssessments } = assessmentsQuery;
  useFocusEffect(
    useCallback(() => {
      refetchConsultation();
      refetchMessages();
      refetchReview();
      refetchAssessments();
    }, [refetchConsultation, refetchMessages, refetchReview, refetchAssessments]),
  );

  const skeleton = (
    <View style={styles.details}>
      <SkeletonCard />
      <SkeletonList count={3} />
    </View>
  );
  // Each guard ends in content, a Retry banner or "not found": a failed load never leaves the screen spinning.
  if (!consultation) {
    return (
      <View style={styles.flex}>
        <ScreenState
          query={consultationQuery}
          errorTitle="Couldn't load this consultation"
          empty={{ title: 'Consultation not found', description: 'It may have been removed.', icon: FileQuestion }}
          skeleton={skeleton}
        />
      </View>
    );
  }
  if (messagesQuery.data === undefined) {
    return (
      <View style={styles.flex}>
        <ScreenState query={messagesQuery} errorTitle="Couldn't load the messages" skeleton={skeleton} />
      </View>
    );
  }

  const isRequester = consultation.user_id === userId;
  const isExpert = consultation.expert_id === userId;
  const counterpartyName =
    (isRequester ? consultation.expert?.full_name : consultation.user?.full_name) ||
    'Unknown';

  const advance = async (to: ConsultationStatus) => {
    try {
      await statusMutation.mutateAsync(to);
    } catch (error) {
      toast.error(`Could not update the consultation. ${errorMessage(error)}`);
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
      toast.success('Recommendation sent');
    } catch (error) {
      toast.error(`Could not send the recommendation. ${errorMessage(error)}`);
    }
  };

  const onSubmitReview = async () => {
    if (!userId || !consultation.expert_id) return;
    try {
      await reviewMutation.mutateAsync({ rating: reviewRating, comment: reviewComment || null });
      setReviewVisible(false);
      toast.success('Review submitted');
    } catch (error) {
      toast.error(`Could not submit the review. ${errorMessage(error)}`);
    }
  };

  const canAccept = isExpert && consultation.status === 'requested';
  const canReject = isExpert && consultation.status === 'requested';
  const canStart = isExpert && consultation.status === 'accepted';
  const canResolve = isExpert && consultation.status === 'in_progress';
  const canCancel = isRequester && ['requested', 'accepted'].includes(consultation.status);
  const canClose = isRequester && consultation.status === 'resolved';
  const canReview = isRequester && consultation.status === 'resolved' && !review;
  // The server allows only the assigned expert while the consultation is open (403 otherwise); this only hides the button.
  const canAssess = isExpert && ['accepted', 'in_progress'].includes(consultation.status);
  const expertName = consultation.expert?.full_name || 'the expert';

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={composer.keyboardOffset}
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
                <Text style={styles.subject} accessibilityRole="header">
                  {consultation.subject}
                </Text>
                <StatusBadge kind="consultation" status={consultation.status} />
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
                      <Image
                        key={path}
                        source={{ uri: attachmentUrls[path] }}
                        style={styles.image}
                        accessible
                        accessibilityRole="image"
                        accessibilityLabel="Photo of the problem"
                      />
                    ) : null,
                  )}
                </View>
              ) : null}

              {consultation.ai_report ? <AiAssessmentCard summary={consultation.ai_report} /> : null}

              {/* SRDS §35: the expert's answer is its own panel, never merged into the AI card above. */}
              <ExpertAssessmentPanel
                assessments={assessments}
                expertName={expertName}
                action={
                  canAssess ? (
                    <Button
                      label="Add assessment"
                      icon={ClipboardList}
                      variant="secondary"
                      onPress={() => setAssessmentVisible(true)}
                    />
                  ) : undefined
                }
              />

              {review ? (
                <Card style={styles.reviewCard}>
                  <Text style={styles.reviewTitle} accessibilityRole="header">
                    Your Review
                  </Text>
                  <RatingStars value={review.rating} />
                  {review.comment ? <Text style={styles.description}>{review.comment}</Text> : null}
                </Card>
              ) : null}

              <View style={styles.actions}>
                {canAccept ? (
                  <Button
                    label="Accept"
                    icon={Check}
                    loading={updating}
                    onPress={() => advance('accepted')}
                    style={styles.action}
                  />
                ) : null}
                {canReject ? (
                  <Button
                    label="Reject"
                    icon={X}
                    variant="danger"
                    loading={updating}
                    onPress={() => advance('rejected')}
                    style={styles.action}
                  />
                ) : null}
                {canStart ? (
                  <Button
                    label="Start Working"
                    icon={Play}
                    loading={updating}
                    onPress={() => advance('in_progress')}
                    style={styles.action}
                  />
                ) : null}
                {canResolve ? (
                  <Button
                    label="Mark Resolved"
                    icon={CircleCheck}
                    loading={updating}
                    onPress={() => advance('resolved')}
                    style={styles.action}
                  />
                ) : null}
                {canCancel ? (
                  <Button
                    label="Cancel Request"
                    icon={Ban}
                    variant="danger"
                    loading={updating}
                    onPress={() => advance('cancelled')}
                    style={styles.action}
                  />
                ) : null}
                {canClose ? (
                  <Button
                    label="Close Consultation"
                    icon={Lock}
                    loading={updating}
                    onPress={() => advance('closed')}
                    style={styles.action}
                  />
                ) : null}
                {canReview ? (
                  <Button
                    label="Write a Review"
                    icon={Star}
                    variant="secondary"
                    onPress={() => setReviewVisible(true)}
                    style={styles.action}
                  />
                ) : null}
                {isExpert ? (
                  <Button
                    label="Recommend a Product"
                    icon={ShoppingBag}
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

      <Sheet visible={recommendVisible} onClose={() => setRecommendVisible(false)} title="Recommend a Product">
        <SelectField
          label="Listing"
          value={selectedListingId}
          options={listingOptions.map(l => ({ id: l.id, label: l.title }))}
          onSelect={setSelectedListingId}
        />
        <Button label="Send Recommendation" icon={Send} loading={sending} onPress={onSendRecommendation} />
      </Sheet>

      <AddAssessmentSheet
        consultationId={consultationId}
        visible={assessmentVisible}
        onClose={() => setAssessmentVisible(false)}
      />

      <Sheet visible={reviewVisible} onClose={() => setReviewVisible(false)} title="Rate this Consultation">
        <View style={styles.starsRow}>
          <RatingStars value={reviewRating} size={theme.size.iconLg} onChange={setReviewRating} />
        </View>
        <TextField
          label="Comment (optional)"
          value={reviewComment}
          onChangeText={setReviewComment}
          multiline
          numberOfLines={3}
        />
        <Button label="Submit Review" icon={Star} loading={submittingReview} onPress={onSubmitReview} />
      </Sheet>
    </KeyboardAvoidingView>
  );
}

function makeStyles({ colors, space, radius, typography, fontWeight, size, borders }: Theme) {
  return StyleSheet.create({
    flex: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    list: {
      paddingVertical: space[3],
    },
    details: {
      padding: space[4],
      borderBottomWidth: borders.hairline,
      borderBottomColor: colors.line,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: space[1],
    },
    subject: {
      flex: 1,
      marginRight: space[2],
      ...typography.title,
      color: colors.ink,
    },
    meta: {
      ...typography.caption,
      color: colors.ink2,
      marginBottom: space[1] / 2,
    },
    descriptionCard: {
      marginTop: space[2],
    },
    description: {
      ...typography.caption,
      color: colors.ink,
    },
    imageRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space[2],
      marginTop: space[2],
    },
    image: {
      width: size.photoMd,
      height: size.photoMd,
      borderRadius: radius.sm,
      backgroundColor: colors.line,
    },
    reviewCard: {
      marginTop: space[3],
    },
    reviewTitle: {
      ...typography.caption,
      fontWeight: fontWeight.semibold,
      color: colors.ink2,
      marginBottom: space[1],
    },
    actions: {
      marginTop: space[3],
    },
    action: {
      marginTop: space[2],
    },
    starsRow: {
      marginBottom: space[3],
    },
  });
}
