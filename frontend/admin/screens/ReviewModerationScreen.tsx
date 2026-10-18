import { useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Eye, EyeOff, Star } from 'lucide-react-native';
import { Badge, Banner, Button, Card, ScreenState, Sheet, TextField, useToast } from '../../common/components';
import { RatingStars } from '../../common/reviews';
import { useTheme, type Theme } from '../../theme';
import { errorMessage } from '../../utils/errorMessage';
import { useModerationReviews, useSetReviewHidden } from '../hooks/admin';
import type { ReviewWithBuyer } from '../types/reviews';

// Matches reviews_hidden_reason_check: a hidden review always says why, in 1-500 characters.
const MAX_REASON = 500;

const WRITTEN = new Intl.DateTimeFormat('en-PK', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Every review, hidden ones included (SRDS §14). The admin hides a review with a reason or restores it; nothing is
 * deleted. Both need two-step verification and are audited by the API (BR-15); a refusal shows in the banner.
 */
export function ReviewModerationScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const query = useModerationReviews();
  const { refetch } = query;
  const setHidden = useSetReviewHidden();
  const [hiding, setHiding] = useState<ReviewWithBuyer | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [failure, setFailure] = useState<string | null>(null);
  const toast = useToast();

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const run = async (id: string, hideReason: string | null) => {
    setFailure(null);
    try {
      await setHidden.mutateAsync({ id, reason: hideReason });
      toast.success(hideReason ? 'Review hidden' : 'Review restored');
    } catch (error) {
      setFailure(errorMessage(error));
    }
  };

  const confirmHide = async () => {
    if (!hiding) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      setReasonError('Say why the review is hidden');
      return;
    }
    const target = hiding;
    setHiding(null);
    await run(target.id, trimmed);
  };

  const busyId = setHidden.isPending ? setHidden.variables?.id : undefined;

  return (
    <View style={styles.screen}>
      {/* A refused hide or restore (two-step verification needed) stays on screen until the next try. */}
      {failure ? (
        <View style={styles.banner}>
          <Banner tone="danger">{failure}</Banner>
        </View>
      ) : null}
      <ScreenState
        query={query}
        errorTitle="Couldn't load the reviews"
        empty={{ title: 'No reviews yet', description: 'Buyer reviews will show up here.', icon: Star }}
      >
        {data => (
          <FlashList
            data={data}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View style={styles.item}>
                <Card>
                  <View style={styles.header}>
                    <RatingStars value={item.rating} />
                    {item.hidden_at ? <Badge label="Hidden" tone="warning" size="sm" /> : null}
                  </View>
                  <Text style={styles.comment}>{item.comment || 'No comment'}</Text>
                  <Text style={styles.meta}>{`${item.buyer?.full_name || 'Unknown buyer'} · ${WRITTEN.format(new Date(item.created_at))}`}</Text>
                  {item.hidden_at && item.hidden_reason ? <Text style={styles.meta}>{`Hidden: ${item.hidden_reason}`}</Text> : null}
                  <View style={styles.action}>
                    {item.hidden_at ? (
                      <Button
                        label="Restore"
                        icon={Eye}
                        variant="secondary"
                        size="sm"
                        fullWidth={false}
                        loading={busyId === item.id}
                        onPress={() => run(item.id, null)}
                      />
                    ) : (
                      <Button
                        label="Hide"
                        icon={EyeOff}
                        variant="danger"
                        size="sm"
                        fullWidth={false}
                        loading={busyId === item.id}
                        onPress={() => {
                          setReason('');
                          setReasonError(undefined);
                          setHiding(item);
                        }}
                      />
                    )}
                  </View>
                </Card>
              </View>
            )}
          />
        )}
      </ScreenState>

      <Sheet visible={hiding !== null} onClose={() => setHiding(null)} title="Hide this review">
        <View style={styles.sheet}>
          <TextField
            label="Reason"
            helper="Kept with the review; buyers no longer see it."
            value={reason}
            onChangeText={text => {
              setReason(text);
              setReasonError(undefined);
            }}
            error={reasonError}
            maxLength={MAX_REASON}
            multiline
          />
          <Button label="Hide review" icon={EyeOff} variant="danger" onPress={confirmHide} />
        </View>
      </Sheet>
    </View>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.ground },
    banner: { paddingHorizontal: space[4], paddingTop: space[3], gap: space[2] },
    list: { padding: space[4] },
    item: { marginBottom: space[3] },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    comment: { ...typography.body, color: colors.ink, marginTop: space[2] },
    meta: { ...typography.caption, color: colors.ink2, marginTop: space[1] },
    action: { marginTop: space[2], alignSelf: 'flex-start' },
    sheet: { gap: space[3] },
  });
}
