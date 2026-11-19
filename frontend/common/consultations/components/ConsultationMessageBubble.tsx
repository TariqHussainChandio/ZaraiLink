import { ShoppingBag } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme, type Theme, useRoleAccent, type Accent } from '../../../theme';
import type { ConsultationMessageWithListing } from '../../../expert';
import { formatRs } from '../../../utils/money';

export interface ConsultationMessageBubbleProps {
  message: ConsultationMessageWithListing;
  isOwn: boolean;
  /** Signed URLs for `message.attachments`, keyed by storage path. */
  attachmentUrls: Record<string, string>;
  /** The other person's name, read out by a screen reader on their messages ("Dr. Ahsan, 10:30: ..."). */
  senderName?: string;
  onPressRecommendation?: (listingId: string) => void;
}

export function ConsultationMessageBubble({
  message,
  isOwn,
  attachmentUrls,
  senderName,
  onPressRecommendation,
}: ConsultationMessageBubbleProps) {
  const theme = useTheme();
  const accent = useRoleAccent();
  const styles = useMemo(() => makeStyles(theme, accent), [theme, accent]);
  const time = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const from = isOwn ? 'You' : senderName || 'The other person';
  const photoCount = message.attachments.length;
  const photos = photoCount > 0 ? `${photoCount} ${photoCount === 1 ? 'photo' : 'photos'}` : '';
  const content = [photos, message.body].filter(Boolean).join('. ');

  return (
    <View style={[styles.row, isOwn && styles.rowOwn]}>
      <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
        {/* One focus stop for the message, read as "You, <time>: <text>" or "<name>, <time>: <text>", the same as a
            chat bubble (A8). The recommended listing stays outside it: it is a button of its own, and an accessible
            parent would swallow it. The time is in the label, so its visible line below is hidden from the reader. */}
        <View accessible accessibilityLabel={`${from}, ${time}: ${content}`}>
          {message.attachments.length > 0 ? (
            <View style={styles.imagesRow}>
              {message.attachments.map(path =>
                attachmentUrls[path] ? (
                  <Image
                    key={path}
                    testID={`attachment-image-${path}`}
                    source={{ uri: attachmentUrls[path] }}
                    style={styles.attachmentImage}
                  />
                ) : (
                  <View key={path} style={[styles.attachmentImage, styles.attachmentPlaceholder]} />
                ),
              )}
            </View>
          ) : null}
          {message.body ? <Text style={[styles.body, isOwn && styles.bodyOwn]}>{message.body}</Text> : null}
        </View>
        {message.recommended_listing ? (
          <TouchableOpacity
            style={styles.recommendation}
            onPress={() => onPressRecommendation?.(message.recommended_listing!.id)}
            disabled={!onPressRecommendation}
            accessibilityState={{ disabled: !onPressRecommendation }}
            accessibilityRole="button"
            accessibilityLabel={`Recommended listing: ${message.recommended_listing.title}, ${formatRs(message.recommended_listing.price)} per ${message.recommended_listing.unit}`}
          >
            <ShoppingBag size={theme.size.iconSm} color={theme.colors.module.marketplace} />
            <View style={styles.recommendationText}>
              <Text style={styles.recommendationTitle} numberOfLines={1}>
                {message.recommended_listing.title}
              </Text>
              <Text style={styles.recommendationPrice}>
                {formatRs(message.recommended_listing.price)} / {message.recommended_listing.unit}
              </Text>
            </View>
          </TouchableOpacity>
        ) : null}
        <Text
          style={[styles.time, isOwn && styles.timeOwn]}
          importantForAccessibility="no"
          accessibilityElementsHidden
        >
          {time}
        </Text>
      </View>
    </View>
  );
}

function makeStyles({ colors, space, radius, typography, fontWeight, size }: Theme, accent: Accent) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      marginVertical: space[1] / 2,
      paddingHorizontal: space[4],
    },
    rowOwn: {
      justifyContent: 'flex-end',
    },
    bubble: {
      maxWidth: '78%',
      borderRadius: radius.md,
      paddingHorizontal: space[3],
      paddingVertical: space[2],
    },
    bubbleOther: {
      backgroundColor: colors.line,
      borderBottomLeftRadius: radius.xs,
    },
    bubbleOwn: {
      backgroundColor: accent.fill,
      borderBottomRightRadius: radius.xs,
    },
    imagesRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space[1],
      marginBottom: space[1],
    },
    attachmentImage: {
      width: size.photoLg,
      height: size.photoLg,
      borderRadius: radius.sm,
      backgroundColor: colors.ground,
    },
    attachmentPlaceholder: {},
    body: {
      ...typography.bodyLg,
      color: colors.ink,
    },
    bodyOwn: {
      color: colors.onAccent,
    },
    recommendation: {
      flexDirection: 'row',
      minHeight: size.touchMin,
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.sm,
      padding: space[2],
      marginTop: space[1],
      gap: space[2],
    },
    recommendationText: {
      flex: 1,
    },
    recommendationTitle: {
      ...typography.caption,
      fontWeight: fontWeight.semibold,
      color: colors.ink,
    },
    recommendationPrice: {
      ...typography.caption,
      color: colors.ink2,
    },
    time: {
      marginTop: space[1] / 2,
      ...typography.caption,
      color: colors.ink2,
      alignSelf: 'flex-end',
    },
    timeOwn: {
      // Timestamps on an outgoing (filled) bubble: the text colour of the fill, a little quieter.
      color: colors.onAccent,
      opacity: 0.8,
    },
  });
}
