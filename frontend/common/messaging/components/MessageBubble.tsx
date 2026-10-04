import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useTheme, type Theme, useRoleAccent, type Accent } from '../../../theme';
import type { Message } from '../types/messaging';

export interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  /** Signed URLs for `message.attachments`, keyed by storage path — resolved by the parent screen. */
  attachmentUrls: Record<string, string>;
}

export function MessageBubble({ message, isOwn, attachmentUrls }: MessageBubbleProps) {
  const theme = useTheme();
  const accent = useRoleAccent();
  const styles = useMemo(() => makeStyles(theme, accent), [theme, accent]);

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
                <View key={path} style={styles.image} />
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

function makeStyles({ colors, space, radius, typography, size }: Theme, accent: Accent) {
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
    image: {
      width: size.photoLg,
      height: size.photoLg,
      borderRadius: radius.sm,
      backgroundColor: colors.ground,
    },
    body: {
      ...typography.bodyLg,
      color: colors.ink,
    },
    bodyOwn: {
      color: colors.onAccent,
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
