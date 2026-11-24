// One row in the inbox: the other person, last message, time and unread dot.
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../../components';
import { useTheme, type Theme } from '../../../theme';
import { formatDay, formatTime } from '../../../utils/dates';
import type { ConversationContextType, ConversationWithPreview } from '../types/messaging';

// What the conversation is about (SRDS §30, A5); conversations from before A5 carry no context and show none.
const CONTEXT_LABELS: Record<ConversationContextType, string> = {
  listing: 'Listing inquiry',
  order: 'Order',
  consultation: 'Consultation',
};

export interface ConversationListItemProps {
  conversation: ConversationWithPreview;
  /** The signed-in user, to tell "You: ..." from the other person's words. */
  userId: string | undefined;
  /** Their last message is unread: the notification dot and a bold name (FA-18). */
  unread: boolean;
  onPress: () => void;
}

/** What the row says the last message was: its words, or "Photo" / "3 photos" when it had none. */
export function previewOf(conversation: ConversationWithPreview, userId: string | undefined): string {
  const last = conversation.lastMessage;
  if (!last) return 'No messages yet';
  const what = last.body.trim() || (last.attachments.length === 1 ? 'Photo' : `${last.attachments.length} photos`);
  return last.sender_id === userId ? `You: ${what}` : what;
}

/** Today shows the time, any other day the date. */
function whenOf(iso: string): string {
  return formatDay(iso) === formatDay(new Date()) ? formatTime(iso) : formatDay(iso);
}

/** One conversation. Unread ones have a bold name and the amber notification dot (the colour of the bell's count), and
 * say "unread" aloud. A row of its own, not a ListRow, because ListRow's title is always bold and so cannot mark what is
 * new. */
export function ConversationListItem({ conversation, userId, unread, onPress }: ConversationListItemProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // An empty name reads like a missing one, never as a blank row.
  const name = conversation.otherParticipant?.full_name || 'Unknown';
  const preview = previewOf(conversation, userId);
  const when = conversation.lastMessage ? whenOf(conversation.lastMessage.created_at) : null;
  const context = conversation.context_type ? CONTEXT_LABELS[conversation.context_type] : null;

  return (
    <Pressable
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}${unread ? ', unread' : ''}${context ? `, ${context}` : ''}${when ? `, ${when}` : ''}: ${preview}`}
      accessibilityHint="Opens the chat"
      android_ripple={{ color: theme.colors.ripple }}
    >
      <Avatar name={name} uri={conversation.otherParticipant?.avatar_url} size={theme.size.avatarMd} />
      <View style={styles.main}>
        <Text style={unread ? styles.nameUnread : styles.name} numberOfLines={1}>
          {name}
        </Text>
        {context ? (
          <Text style={styles.context} numberOfLines={1}>
            {context}
          </Text>
        ) : null}
        <Text style={unread ? styles.previewUnread : styles.preview} numberOfLines={1}>
          {preview}
        </Text>
      </View>
      <View style={styles.end}>
        {when ? <Text style={styles.time}>{when}</Text> : null}
        {unread ? <View testID="unread-dot" style={styles.dot} /> : null}
      </View>
    </Pressable>
  );
}

// Builds this component's styles from the theme.
function makeStyles({ colors, space, typography, components, size, radius }: Theme) {
  const { row } = components;
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: row.gap,
      minHeight: row.minHeight,
      paddingHorizontal: row.paddingX,
      paddingVertical: row.paddingY,
      backgroundColor: colors.surface,
    },
    main: { flex: 1, minWidth: 0 },
    name: { ...typography.body, color: colors.ink },
    nameUnread: { ...typography.bodyStrong, color: colors.ink },
    // The words of the last message are content, so `body`, not the metadata `caption`.
    preview: { ...typography.body, color: colors.ink2 },
    previewUnread: { ...typography.body, color: colors.ink },
    context: { ...typography.caption, color: colors.ink2 },
    end: { alignItems: 'flex-end', gap: space[1], flexShrink: 0 },
    time: { ...typography.caption, color: colors.ink2 },
    dot: { width: size.dot, height: size.dot, borderRadius: radius.pill, backgroundColor: colors.module.notifications },
  });
}
