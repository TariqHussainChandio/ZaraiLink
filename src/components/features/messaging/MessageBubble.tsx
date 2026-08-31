import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useTheme, type Theme } from '../../../theme';
import type { Message } from '../../../types/messaging';

export interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  /** Signed URLs for `message.attachments`, keyed by storage path — resolved by the parent screen. */
  attachmentUrls: Record<string, string>;
}

export function MessageBubble({ message, isOwn, attachmentUrls }: MessageBubbleProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <View style={[styles.row, isOwn && styles.rowOwn]}>
      <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
        {message.attachments.length > 0 ? (
          <View style={styles.imagesRow}>
            {message.attachments.map(path =>
              attachmentUrls[path] ? (
                <Image
                  key={path}
                  testID={`attachment-image-${path}`}
                  source={{ uri: attachmentUrls[path] }}
                  style={styles.image}
                />
              ) : (
                <View key={path} style={[styles.image, styles.imagePlaceholder]} />
              ),
            )}
          </View>
        ) : null}
        {message.body ? <Text style={[styles.body, isOwn && styles.bodyOwn]}>{message.body}</Text> : null}
        <Text style={[styles.time, isOwn && styles.timeOwn]}>
          {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );
}

function makeStyles({ colors, spacing, radii, typography }: Theme) {
  return StyleSheet.create({
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
      backgroundColor: colors.border,
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
    image: {
      width: 140,
      height: 140,
      borderRadius: radii.md,
      backgroundColor: colors.background.default,
    },
    imagePlaceholder: {},
    body: {
      fontSize: typography.sizes.sm,
      color: colors.text.primary,
    },
    bodyOwn: {
      color: colors.neutral.white,
    },
    time: {
      marginTop: spacing.xs / 2,
      fontSize: 10,
      color: colors.text.secondary,
      alignSelf: 'flex-end',
    },
    timeOwn: {
      color: 'rgba(255,255,255,0.75)',
    },
  });
}
