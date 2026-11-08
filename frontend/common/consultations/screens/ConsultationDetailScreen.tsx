import { useFocusEffect, useRoute } from '@react-navigation/native';
import { Check, ShoppingBag } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import {
  Banner,
  Button,
  Card,
  ConfirmSheet,
  ListGroup,
  ListRow,
  PhotoViewer,
  QueryState,
  ScreenScaffold,
  Sheet,
  StickyActionBar,
  TextField,
  useSnackbar,
} from '../../components';
import { ConsultationMessageBubble } from '../components/ConsultationMessageBubble';
import { CaseSummaryCard } from '../components/CaseSummaryCard';
import type { AiSuggestion } from '../components/AiSuggestionBlock';
import { isClosedStatus } from '../utils/requests';
import { ChatInput } from '../../messaging';
import { RatingStars } from '../../reviews';
import { APP_TABS, MARKETPLACE_ROUTES } from '../../constants/routes';
import {
  useConsultation,
  useConsultationAttachmentUrls,
  useConsultationMessages,
  useConsultationReview,
  useCreateConsultationReview,
  useSendConsultationMessage,
  useUpdateConsultationStatus,
} from '../hooks/consultations';
import { useListingOptions } from '../../marketplace';
import { navigateInTab } from '../../../navigation/navigateInTab';
import { useAppTabNavigation } from '../../../navigation/stacks/useAppTabNavigation';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';
import type { ConsultationMessageWithListing, ConsultationStatus } from '../../../expert';
import { formatWhen } from '../../../utils/dates';
import { errorMessage } from '../../../utils/errorMessage';
import type { PickedPhoto } from '../../../utils/photoPicker';

type ThreadItem =
  { kind: 'day'; id: string; label: string } | { kind: 'message'; id: string; message: ConsultationMessageWithListing };

/** "Today", "Yesterday" or "8 Nov": the day part of the app's date format. */
const dayLabel = (iso: string) => formatWhen(iso).split(',', 1)[0] ?? '';

/** The thread with a separator wherever the day changes. */
function withDaySeparators(messages: ConsultationMessageWithListing[]): ThreadItem[] {
  const items: ThreadItem[] = [];
  let lastLabel = '';
  for (const message of messages) {
    const label = dayLabel(message.created_at);
    if (label !== lastLabel) {
      items.push({ kind: 'day', id: `day-${message.id}`, label });
      lastLabel = label;
    }
    items.push({ kind: 'message', id: message.id, message });
  }
  return items;
}

/** Why nobody can write any more, said to the person looking at it. */
const CLOSED_REASON: Partial<Record<ConsultationStatus, string>> = {
  closed: 'The requester closed this consultation. Nothing more can be sent.',
  rejected: 'The expert declined this request. Nothing more can be sent.',
  cancelled: 'The requester cancelled this request. Nothing more can be sent.',
  expired: 'This request expired without an answer. Nothing more can be sent.',
};

interface ViewerState {
  photos: { uri: string; label: string }[];
  index: number;
}

/** A consultation: the case on top, the conversation under it, and what this person can do about it pinned at the
 * bottom for the case's status (D4), so a long thread never pushes "Mark resolved" off the screen (FA-17). */
export function ConsultationDetailScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const snackbar = useSnackbar();
  const params = useRoute().params as {
    consultationId: string;
    aiSuggestion?: AiSuggestion;
  };
  const { consultationId } = params;
  // The scan's suggestion arrives with the request that came from a scan; absent for every other case.
  const aiSuggestion = params.aiSuggestion ?? null;
  const tabs = useAppTabNavigation();
  const userId = useAuthStore(state => state.user?.id);

  const consultationQuery = useConsultation(consultationId);
  const messagesQuery = useConsultationMessages(consultationId);
  const reviewQuery = useConsultationReview(consultationId);
  const consultation = consultationQuery.data;
  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);
  const review = reviewQuery.data ?? null;
  const items = useMemo(() => withDaySeparators(messages), [messages]);
  const attachmentPaths = useMemo(
    () => [...(consultation?.images ?? []), ...messages.flatMap(m => m.attachments)],
    [consultation, messages],
  );
  const { data: attachmentUrls = {} } = useConsultationAttachmentUrls(attachmentPaths);

  const statusMutation = useUpdateConsultationStatus(consultationId);
  const send = useSendConsultationMessage(consultationId, userId);
  const reviewMutation = useCreateConsultationReview(consultationId);
  const sending = send.isPending;

  // Which status change is running, so only the button that was pressed shows the spinner (FA-11).
  const [pending, setPending] = useState<ConsultationStatus | null>(null);
  const [confirming, setConfirming] = useState<'decline' | 'cancel' | null>(null);
  const [recommendVisible, setRecommendVisible] = useState(false);
  const listingsQuery = useListingOptions(recommendVisible);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [reviewVisible, setReviewVisible] = useState(false);
  // Unrated until a star is chosen: a default of five would send praise nobody gave.
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewFailure, setReviewFailure] = useState<string | null>(null);
  const [recommendFailure, setRecommendFailure] = useState<string | null>(null);
  const [viewer, setViewer] = useState<ViewerState | null>(null);

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

  const isRequester = !!consultation && consultation.user_id === userId;
  const isExpert = !!consultation && consultation.expert_id === userId;
  const counterpartyName = (isRequester ? consultation?.expert?.full_name : consultation?.user?.full_name) || 'Unknown';

  const advance = async (to: ConsultationStatus) => {
    setPending(to);
    try {
      await statusMutation.mutateAsync(to);
    } catch (error) {
      snackbar.show(`Couldn't update the consultation. ${errorMessage(error)}`);
    } finally {
      setPending(null);
    }
  };

  const onSend = async (body: string, images: PickedPhoto[]) => {
    if (!userId) return;
    try {
      await send.mutateAsync({ body, images });
    } catch (error) {
      snackbar.show(`Message not sent. ${errorMessage(error)}`);
    }
  };

  const onSendRecommendation = async () => {
    const listing = listingsQuery.data?.find(l => l.id === selectedListingId);
    if (!userId || !listing) return;
    setRecommendFailure(null);
    try {
      await send.mutateAsync({
        body: `Recommended: ${listing.title}`,
        recommendedListingId: listing.id,
      });
      setRecommendVisible(false);
      setSelectedListingId(null);
    } catch (error) {
      setRecommendFailure(errorMessage(error));
    }
  };

  const onSubmitReview = async () => {
    if (!userId || !consultation?.expert_id || reviewRating === 0) return;
    setReviewFailure(null);
    try {
      await reviewMutation.mutateAsync({
        rating: reviewRating,
        comment: reviewComment.trim() || null,
      });
      setReviewVisible(false);
      setReviewRating(0);
      setReviewComment('');
    } catch (error) {
      setReviewFailure(errorMessage(error));
    }
  };

  /** Opens `paths`' photos full screen on the tapped one, skipping any whose link has not arrived yet. */
  const openPhotos = (paths: string[], tapped: number, owner: string) => {
    const photos = paths
      .map((path, i) => ({
        i,
        uri: attachmentUrls[path],
        label: `Photo ${i + 1} of ${paths.length} from ${owner}`,
      }))
      .filter((photo): photo is { i: number; uri: string; label: string } => !!photo.uri);
    const index = Math.max(
      0,
      photos.findIndex(photo => photo.i === tapped),
    );
    if (photos.length > 0)
      setViewer({
        photos: photos.map(({ uri, label }) => ({ uri, label })),
        index,
      });
  };

  const status = consultation?.status;
  const requesterName = consultation?.user?.full_name || 'The requester';
  const canReview = isRequester && status === 'resolved' && !review;
  const canRecommend = isExpert && (status === 'accepted' || status === 'in_progress');

  // The pinned actions, by who is looking and what the status allows. Only what this person can do now is shown.
  let actionBar: React.ReactNode = null;
  if (consultation && status) {
    const busy = (to: ConsultationStatus) => ({
      loading: pending === to,
      disabled: pending !== null && pending !== to,
    });
    const recommend = canRecommend ? (
      <Button
        label="Recommend a product"
        variant="secondary"
        size="lg"
        icon={ShoppingBag}
        fullWidth={false}
        style={styles.barButton}
        onPress={() => setRecommendVisible(true)}
      />
    ) : null;
    let primary: React.ReactNode = null;
    let secondary: React.ReactNode = recommend;
    if (isExpert && status === 'requested') {
      secondary = (
        <Button
          label="Decline"
          variant="secondary"
          size="lg"
          fullWidth={false}
          style={styles.barButton}
          onPress={() => setConfirming('decline')}
        />
      );
      primary = (
        <Button
          label="Accept"
          size="lg"
          fullWidth={false}
          style={styles.barButton}
          onPress={() => advance('accepted')}
          {...busy('accepted')}
        />
      );
    } else if (isExpert && status === 'accepted') {
      primary = (
        <Button
          label="Start working"
          size="lg"
          fullWidth={false}
          style={styles.barButton}
          onPress={() => advance('in_progress')}
          {...busy('in_progress')}
        />
      );
    } else if (isExpert && status === 'in_progress') {
      primary = (
        <Button
          label="Mark resolved"
          size="lg"
          fullWidth={false}
          style={styles.barButton}
          onPress={() => advance('resolved')}
          {...busy('resolved')}
        />
      );
    } else if (isRequester && (status === 'requested' || status === 'accepted')) {
      primary = (
        <Button
          label="Cancel request"
          variant="secondary"
          size="lg"
          fullWidth={false}
          style={styles.barButton}
          onPress={() => setConfirming('cancel')}
        />
      );
    } else if (isRequester && status === 'resolved') {
      const close = (
        <Button
          label="Close consultation"
          variant={canReview ? 'secondary' : 'primary'}
          size="lg"
          fullWidth={false}
          style={styles.barButton}
          onPress={() => advance('closed')}
          {...busy('closed')}
        />
      );
      if (canReview) {
        secondary = close;
        primary = (
          <Button
            label="Write a review"
            size="lg"
            fullWidth={false}
            style={styles.barButton}
            onPress={() => setReviewVisible(true)}
          />
        );
      } else {
        primary = close;
      }
    }
    if (primary || secondary) {
      actionBar = (
        <StickyActionBar>
          <View style={styles.barRow}>
            {secondary}
            {primary}
          </View>
        </StickyActionBar>
      );
    }
  }

  const composer =
    consultation && status && isClosedStatus(status) ? (
      <View style={styles.closed}>
        <Banner tone="info" title="This consultation is closed">
          {CLOSED_REASON[status] ?? 'Nothing more can be sent.'}
        </Banner>
      </View>
    ) : (
      <ChatInput onSend={onSend} sending={sending} />
    );

  const photoUrls = (consultation?.images ?? []).map(path => attachmentUrls[path]);

  const header = consultation ? (
    <View style={styles.header}>
      <CaseSummaryCard
        consultation={consultation}
        counterpartyName={counterpartyName}
        photoUrls={photoUrls}
        onOpenPhoto={index => openPhotos(consultation.images, index, requesterName)}
        ai={aiSuggestion}
      />
      {review ? (
        <Card>
          <Text style={styles.reviewTitle}>{isRequester ? 'Your review' : `Review from ${requesterName}`}</Text>
          <RatingStars value={review.rating} />
          {review.comment ? <Text style={styles.reviewComment}>{review.comment}</Text> : null}
        </Card>
      ) : null}
      {messagesQuery.isError ? (
        <Banner
          tone="danger"
          title="Couldn't load the messages"
          actionLabel="Try again"
          onAction={() => messagesQuery.refetch()}
        >
          {errorMessage(messagesQuery.error)}
        </Banner>
      ) : null}
    </View>
  ) : null;

  return (
    <ScreenScaffold
      scroll={false}
      footer={
        consultation ? (
          <View>
            {actionBar}
            {composer}
          </View>
        ) : undefined
      }
    >
      <QueryState query={consultationQuery} failureTitle="Couldn't load this consultation">
        <View style={styles.flex}>
          <FlashList
            data={items}
            // FlashList v2 has no `inverted`: the newest message is at the bottom and the list starts and follows there.
            maintainVisibleContentPosition={{
              startRenderingFromBottom: true,
              autoscrollToBottomThreshold: 0.2,
            }}
            keyExtractor={item => item.id}
            getItemType={item => item.kind}
            contentContainerStyle={styles.list}
            ListHeaderComponent={header}
            renderItem={({ item }) =>
              item.kind === 'day' ? (
                <Text style={styles.day} accessibilityRole="header">
                  {item.label}
                </Text>
              ) : (
                <ConsultationMessageBubble
                  message={item.message}
                  isOwn={item.message.sender_id === userId}
                  senderName={item.message.sender_id === userId ? 'You' : counterpartyName}
                  attachmentUrls={attachmentUrls}
                  onPressPhoto={index =>
                    openPhotos(
                      item.message.attachments,
                      index,
                      item.message.sender_id === userId ? 'you' : counterpartyName,
                    )
                  }
                  onPressRecommendation={listingId =>
                    navigateInTab(tabs, APP_TABS.Marketplace, MARKETPLACE_ROUTES.ListingDetail, { listingId })
                  }
                />
              )
            }
          />
        </View>
      </QueryState>

      <ConfirmSheet
        visible={confirming === 'decline'}
        onClose={() => setConfirming(null)}
        title="Decline this request?"
        message={`${requesterName} is told you declined it. This cannot be undone.`}
        confirmLabel="Decline request"
        keepLabel="Keep the request"
        destructive
        onConfirm={() => statusMutation.mutateAsync('rejected')}
      />
      <ConfirmSheet
        visible={confirming === 'cancel'}
        onClose={() => setConfirming(null)}
        title="Cancel this request?"
        message={`${counterpartyName} is told you cancelled it. This cannot be undone.`}
        confirmLabel="Cancel request"
        keepLabel="Keep the request"
        destructive
        onConfirm={() => statusMutation.mutateAsync('cancelled')}
      />

      <Sheet
        visible={recommendVisible}
        onClose={() => setRecommendVisible(false)}
        title="Recommend a product"
        footer={
          <Button
            label="Send recommendation"
            loading={sending}
            disabled={!selectedListingId}
            onPress={onSendRecommendation}
          />
        }
      >
        <View style={styles.sheetBody}>
          {recommendFailure ? (
            <Banner tone="danger" title="Couldn't send the recommendation">
              {recommendFailure}
            </Banner>
          ) : null}
          <QueryState
            query={listingsQuery}
            isEmpty={(listingsQuery.data ?? []).length === 0}
            empty={{
              title: 'No products to recommend',
              description: 'Listings that sellers publish appear here.',
            }}
            failureTitle="Couldn't load products"
          >
            <ListGroup>
              {(listingsQuery.data ?? []).map(listing => (
                <ListRow
                  key={listing.id}
                  title={listing.title}
                  trailing={
                    selectedListingId === listing.id ? (
                      <Check color={theme.colors.ink} size={theme.size.iconMd} />
                    ) : undefined
                  }
                  accessibilityLabel={`${listing.title}${selectedListingId === listing.id ? ', selected' : ''}`}
                  onPress={() => setSelectedListingId(listing.id)}
                />
              ))}
            </ListGroup>
          </QueryState>
        </View>
      </Sheet>

      <Sheet
        visible={reviewVisible}
        onClose={() => setReviewVisible(false)}
        title="Rate this consultation"
        footer={
          <Button
            label="Submit review"
            loading={reviewMutation.isPending}
            disabled={reviewRating === 0}
            onPress={onSubmitReview}
          />
        }
      >
        <View style={styles.sheetBody}>
          {reviewFailure ? (
            <Banner tone="danger" title="Couldn't submit your review">
              {reviewFailure}
            </Banner>
          ) : null}
          <RatingStars value={reviewRating} size={theme.size.iconLg} onChange={setReviewRating} />
          <TextField
            label="Comment"
            optional
            value={reviewComment}
            onChangeText={setReviewComment}
            multiline
            numberOfLines={3}
          />
        </View>
      </Sheet>

      <PhotoViewer
        visible={viewer !== null}
        onClose={() => setViewer(null)}
        photos={viewer?.photos ?? []}
        initialIndex={viewer?.index ?? 0}
      />
    </ScreenScaffold>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    flex: { flex: 1 },
    list: { paddingTop: space[3], paddingBottom: space[3] },
    header: { gap: space[3], paddingBottom: space[3] },
    day: {
      ...typography.caption,
      color: colors.ink2,
      textAlign: 'center',
      paddingVertical: space[2],
    },
    reviewTitle: {
      ...typography.label,
      color: colors.ink,
      marginBottom: space[1],
    },
    reviewComment: {
      ...typography.body,
      color: colors.ink,
      marginTop: space[1],
    },
    barRow: { flexDirection: 'row', gap: space[3] },
    barButton: { flex: 1 },
    closed: { padding: space[4], backgroundColor: colors.surface },
    sheetBody: { gap: space[4] },
  });
}
