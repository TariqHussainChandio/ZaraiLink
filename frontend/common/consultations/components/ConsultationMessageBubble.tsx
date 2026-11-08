import { ShoppingBag } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme, type Theme, useRoleAccent, type Accent } from '../../../theme';
import type { ConsultationMessageWithListing } from '../../../expert';
import { formatTime } from '../../../utils/dates';
import { formatRs } from '../../../utils/money';

export interface ConsultationMessageBubbleProps {
  message: ConsultationMessageWithListing;
  isOwn: boolean;
  /** Who wrote it, said in words: "You" for the viewer's own message, otherwise the other person's name (FA-10). */
  senderName: string;
  /** Signed URLs for `message.attachments`, keyed by storage path. */
  attachmentUrls: Record<string, string>;
  onPressRecommendation?: (listingId: string) => void;
  /** Opens this message's photos full screen, on the one tapped. */
  onPressPhoto?: (index: number) => void;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** One message in a consultation. The sender is written and spoken, not only shown by side and colour; the text is one
 * stop for a screen reader ("Dr Ahsan, 3:42 pm: …"); each photo is its own labelled button that opens it. */
export function ConsultationMessageBubble({
  message,
  isOwn,
  senderName,
  attachmentUrls,
  onPressRecommendation,
  onPressPhoto,
}: ConsultationMessageBubbleProps) {
  const theme = useTheme();
  const accent = useRoleAccent();
  const styles = useMemo(() => makeStyles(theme, accent), [theme, accent]);
  const time = formatTime(message.created_at);
  const photoCount = message.attachments.length;

  const spoken = [
    `${senderName}, ${time}`,
    message.body,
    photoCount > 0 && !message.body ? plural(photoCount, 'photo', 'photos') : null,
  ]
    .filter(Boolean)
    .join(message.body ? ': ' : ', ');

  return (
    <View style={[styles.row, isOwn && styles.rowOwn]}>
      <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
        <View accessible accessibilityLabel={spoken}>
          <Text style={[styles.sender, isOwn && styles.onFill]}>{senderName}</Text>
          {message.body ? <Text style={[styles.body, isOwn && styles.onFill]}>{message.body}</Text> : null}
        </View>
        {photoCount > 0 ? (
          <View style={styles.imagesRow}>
            {message.attachments.map((path, index) => {
              const label = `Photo ${index + 1} of ${photoCount} from ${senderName}`;
              return attachmentUrls[path] ? (
                <Pressable
                  key={path}
                  onPress={() => onPressPhoto?.(index)}
                  disabled={!onPressPhoto}
                  accessibilityRole="imagebutton"
                  accessibilityLabel={label}
                  accessibilityHint="Opens the photo full screen"
                >
                  <Image
                    testID={`attachment-image-${path}`}
                    source={{ uri: attachmentUrls[path] }}
                    style={styles.attachmentImage}
                  />
                </Pressable>
              ) : (
                <View
                  key={path}
                  style={[styles.attachmentImage, styles.attachmentPlaceholder]}
                  accessible
                  accessibilityLabel={`${label}, still loading`}
                />
              );
            })}
          </View>
        ) : null}
        {message.recommended_listing ? (
          <TouchableOpacity
            style={styles.recommendation}
            onPress={() => onPressRecommendation?.(message.recommended_listing!.id)}
            disabled={!onPressRecommendation}
            accessibilityRole="button"
            accessibilityLabel={`Recommended listing: ${message.recommended_listing.title}, ${formatRs(message.recommended_listing.price)} per ${message.recommended_listing.unit}`}
          >
            <ShoppingBag size={theme.size.iconSm} color={theme.colors.module.marketplace} />
            <View style={styles.recommendationText}>
              <Text style={styles.recommendationTitle}>{message.recommended_listing.title}</Text>
              <Text style={styles.recommendationPrice}>
                {formatRs(message.recommended_listing.price)} / {message.recommended_listing.unit}
              </Text>
            </View>
          </TouchableOpacity>
        ) : null}
        <Text style={[styles.time, isOwn && styles.onFill]} importantForAccessibility="no">
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
      maxWidth: '82%',
      borderRadius: radius.md,
      paddingHorizontal: space[3],
      paddingVertical: space[2],
      gap: space[1],
    },
    // `line` is a decoration colour; an incoming bubble sits on the sunken surface.
    bubbleOther: {
      backgroundColor: colors.surfaceSunken,
      borderBottomLeftRadius: radius.xs,
    },
    bubbleOwn: {
      backgroundColor: accent.fill,
      borderBottomRightRadius: radius.xs,
    },
    sender: {
      ...typography.caption,
      fontWeight: fontWeight.semibold,
      color: colors.ink2,
    },
    imagesRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space[1],
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
    // Text on the filled own-message bubble, at full strength: a faded time fell under 4.5:1 (FA-19).
    onFill: {
      color: colors.onAccent,
    },
    recommendation: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.sm,
      padding: space[2],
      gap: space[2],
      minHeight: size.touchMin,
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
      ...typography.caption,
      color: colors.ink2,
      alignSelf: 'flex-end',
    },
  });
}
