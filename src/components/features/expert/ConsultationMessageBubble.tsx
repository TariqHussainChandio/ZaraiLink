import { ShoppingBag } from 'lucide-react-native';
import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { lightTheme } from '../../../theme';
import type { ConsultationMessageWithListing } from '../../../types/expert';

export interface ConsultationMessageBubbleProps {
  message: ConsultationMessageWithListing;
  isOwn: boolean;
  /** Signed URLs for `message.attachments`, keyed by storage path. */
  attachmentUrls: Record<string, string>;
  onPressRecommendation?: (listingId: string) => void;
}

const { colors, spacing, radii, typography } = lightTheme;

export function ConsultationMessageBubble({
  message,
  isOwn,
  attachmentUrls,
  onPressRecommendation,
}: ConsultationMessageBubbleProps) {
  return (
    <View style={[styles.row, isOwn && styles.rowOwn]}>
      <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
        {message.attachments.length > 0 ? (
          <View style={styles.imagesRow}>
            {message.attachments.map(path =>
              attachmentUrls[path] ? (
                <Image key={path} source={{ uri: attachmentUrls[path] }} style={styles.attachmentImage} />
              ) : (
                <View key={path} style={[styles.attachmentImage, styles.attachmentPlaceholder]} />
              ),
            )}
          </View>
        ) : null}
        {message.body ? <Text style={[styles.body, isOwn && styles.bodyOwn]}>{message.body}</Text> : null}
        {message.recommended_listing ? (
          <TouchableOpacity
            style={styles.recommendation}
            onPress={() => onPressRecommendation?.(message.recommended_listing!.id)}
            disabled={!onPressRecommendation}
          >
            <ShoppingBag size={16} color={colors.brand.primary} />
            <View style={styles.recommendationText}>
              <Text style={styles.recommendationTitle} numberOfLines={1}>
                {message.recommended_listing.title}
              </Text>
              <Text style={styles.recommendationPrice}>
                Rs. {message.recommended_listing.price.toFixed(0)} / {message.recommended_listing.unit}
              </Text>
            </View>
          </TouchableOpacity>
        ) : null}
        <Text style={[styles.time, isOwn && styles.timeOwn]}>
          {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginVertical: spacing.xs / 2,
    paddingHorizontal: spacing.lg,
  },
  rowOwn: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bubbleOther: {
    backgroundColor: colors.neutral.gray100,
    borderBottomLeftRadius: radii.sm,
  },
  bubbleOwn: {
    backgroundColor: colors.brand.primary,
    borderBottomRightRadius: radii.sm,
  },
  imagesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  attachmentImage: {
    width: 120,
    height: 120,
    borderRadius: radii.md,
    backgroundColor: colors.neutral.gray200,
  },
  attachmentPlaceholder: {},
  body: {
    fontSize: typography.sizes.sm,
    color: colors.neutral.gray900,
  },
  bodyOwn: {
    color: colors.neutral.white,
  },
  recommendation: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.neutral.white,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  recommendationText: {
    flex: 1,
  },
  recommendationTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold as any,
    color: colors.neutral.gray900,
  },
  recommendationPrice: {
    fontSize: typography.sizes.xs,
    color: colors.neutral.gray600,
  },
  time: {
    marginTop: spacing.xs / 2,
    fontSize: 10,
    color: colors.neutral.gray500,
    alignSelf: 'flex-end',
  },
  timeOwn: {
    color: 'rgba(255,255,255,0.75)',
  },
});
