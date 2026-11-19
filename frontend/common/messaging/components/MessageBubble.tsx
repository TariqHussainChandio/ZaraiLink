import { Check, CheckCheck } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme, type Theme, useRoleAccent, type Accent } from '../../../theme';
import { formatTime } from '../../../utils/dates';
import type { Message } from '../types/messaging';

export interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  /** Who sent it, for a screen reader when it is not us ("Green Farms, 3:42 pm: ..."). */
  senderName?: string;
  /** Signed URLs for `message.attachments`, keyed by storage path — resolved by the parent screen. */
  attachmentUrls: Record<string, string>;
  /** `sending` and `failed` are our own message that the server has not confirmed (FA-03). */
  delivery?: 'sent' | 'sending' | 'failed';
  /** Tapping a failed message sends it again. */
  onRetry?: () => void;
  /** Opens the photos in the viewer, on the one tapped. */
  onOpenPhotos?: (index: number) => void;
}

const OPEN_PHOTOS = 'openPhotos';

/** One message. To a screen reader the whole bubble is a single element ("You, 3:42 pm: Hello, 2 photos, read"); the
 * photos are opened from it with the "Open photos" action, and by touch each photo is its own target (FA-10). Our own
 * time and ticks are at the full strength of the text on the fill, because a faded time falls under 4.5:1 (FA-19). */
export function MessageBubble({ message, isOwn, senderName, attachmentUrls, delivery = 'sent', onRetry, onOpenPhotos }: MessageBubbleProps) {
  const theme = useTheme();
  const accent = useRoleAccent();
  const styles = useMemo(() => makeStyles(theme, accent), [theme, accent]);
  const photoCount = message.attachments.length;
  const time = formatTime(message.created_at);
  const read = isOwn && delivery === 'sent' && message.read_at !== null;
  const failed = delivery === 'failed';

  const status = delivery === 'sending' ? 'Sending…' : failed ? 'Not sent · Tap to retry' : null;
  const photoPart = photoCount > 0 ? `${photoCount} ${photoCount === 1 ? 'photo' : 'photos'}` : null;
  const statePart = failed ? 'not sent, double tap to retry' : delivery === 'sending' ? 'sending' : isOwn ? (read ? 'read' : 'sent') : null;
  const spoken = [
    `${isOwn ? 'You' : senderName || 'They'}, ${time}${message.body ? `: ${message.body}` : ''}`,
    photoPart,
    statePart,
  ]
    .filter(Boolean)
    .join(', ');
  const canOpenPhotos = photoCount > 0 && onOpenPhotos !== undefined;

  const content = (
    <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther, failed && styles.bubbleFailed]}>
      {photoCount > 0 ? (
        <View style={styles.imagesRow}>
          {message.attachments.map((path, index) => {
            const uri = attachmentUrls[path];
            if (!uri) return <View key={path} style={styles.image} />;
            return (
              <Pressable
                key={path}
                onPress={canOpenPhotos ? () => onOpenPhotos(index) : undefined}
                disabled={!canOpenPhotos}
                // Reached by touch; TalkBack gets the same through the bubble's "Open photos" action.
                accessible={false}
              >
                <Image testID={`attachment-image-${path}`} source={{ uri }} style={styles.image} />
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {message.body ? <Text style={[styles.body, isOwn && styles.bodyOwn]}>{message.body}</Text> : null}
      <View style={styles.meta}>
        <Text style={[styles.time, isOwn && styles.timeOwn]}>{time}</Text>
        {isOwn && delivery === 'sent' ? (
          read ? (
            <CheckCheck size={theme.size.iconSm} color={theme.colors.onAccent} />
          ) : (
            <Check size={theme.size.iconSm} color={theme.colors.onAccent} />
          )
        ) : null}
      </View>
      {status ? <Text style={[styles.status, failed && styles.statusFailed]}>{status}</Text> : null}
    </View>
  );

  return (
    <View style={[styles.row, isOwn && styles.rowOwn]}>
      {failed && onRetry ? (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel={spoken}
          accessibilityActions={canOpenPhotos ? [{ name: OPEN_PHOTOS, label: 'Open photos' }] : undefined}
          onAccessibilityAction={event => {
            if (event.nativeEvent.actionName === OPEN_PHOTOS) onOpenPhotos?.(0);
          }}
          style={styles.hold}
        >
          {content}
        </Pressable>
      ) : (
        <View
          accessible
          accessibilityLabel={spoken}
          accessibilityActions={canOpenPhotos ? [{ name: OPEN_PHOTOS, label: 'Open photos' }] : undefined}
          onAccessibilityAction={event => {
            if (event.nativeEvent.actionName === OPEN_PHOTOS) onOpenPhotos?.(0);
          }}
          style={styles.hold}
        >
          {content}
        </View>
      )}
    </View>
  );
}

function makeStyles({ colors, space, radius, typography, size, borders }: Theme, accent: Accent) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      marginVertical: space[1] / 2,
    },
    rowOwn: {
      justifyContent: 'flex-end',
    },
    hold: {
      maxWidth: '82%',
    },
    bubble: {
      borderRadius: radius.md,
      paddingHorizontal: space[3],
      paddingVertical: space[2],
    },
    bubbleOther: {
      backgroundColor: colors.surfaceSunken,
      borderBottomLeftRadius: radius.xs,
    },
    bubbleOwn: {
      backgroundColor: accent.fill,
      borderBottomRightRadius: radius.xs,
    },
    // The red edge says it is not sent without relying on the words alone.
    bubbleFailed: {
      borderWidth: borders.focus,
      borderColor: colors.status.danger.mark,
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
    meta: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-end',
      gap: space[1],
      marginTop: space[1] / 2,
    },
    time: {
      ...typography.caption,
      color: colors.ink2,
    },
    timeOwn: {
      // The same colour as the text on the fill, at full strength: any opacity drops it below 4.5:1.
      color: colors.onAccent,
    },
    status: {
      ...typography.caption,
      alignSelf: 'flex-end',
      color: colors.onAccent,
    },
    statusFailed: {
      ...typography.label,
      textDecorationLine: 'underline',
    },
  });
}
