import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Avatar } from '../../components';
import { useTheme, type Theme } from '../../../theme';
import type { ConversationContextType, ConversationWithPreview } from '../types/messaging';

// What the conversation is about (SRDS §30, A5); conversations from before A5 carry no context and show none.
const CONTEXT_LABELS: Record<ConversationContextType, string> = {
  listing: 'Listing inquiry',
  order: 'Order',
  consultation: 'Consultation',
};

export interface ConversationListItemProps {
  conversation: ConversationWithPreview;
  onPress: () => void;
}

export function ConversationListItem({ conversation, onPress }: ConversationListItemProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // An empty name reads like a missing one, never as a blank row.
  const name = conversation.otherParticipant?.full_name || 'Unknown';
  const context = conversation.context_type ? CONTEXT_LABELS[conversation.context_type] : null;
  const date = conversation.lastMessage
    ? new Date(conversation.lastMessage.created_at).toLocaleDateString()
    : null;
  // One spoken sentence for the whole row; the emoji in the visible preview is left out so it is not read aloud.
  const spoken = [
    `Chat with ${name}`,
    context,
    conversation.lastMessage ? `Last message: ${conversation.lastMessage.body}` : 'No messages yet',
    date,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint="Opens the chat"
    >
      <Avatar name={name} uri={conversation.otherParticipant?.avatar_url} size={theme.size.avatarMd} />
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {context ? (
          <Text style={styles.context} numberOfLines={1}>
            {context}
          </Text>
        ) : null}
        <Text style={styles.preview} numberOfLines={1}>
          {conversation.lastMessage?.body ?? 'Say hello 👋'}
        </Text>
      </View>
      {date ? <Text style={styles.time}>{date}</Text> : null}
    </TouchableOpacity>
  );
}

function makeStyles({ colors, space, typography, borders, size }: Theme) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: size.touchMin,
      paddingVertical: space[3],
      paddingHorizontal: space[4],
      borderBottomWidth: borders.hairline,
      borderBottomColor: colors.line,
    },
    body: {
      flex: 1,
      marginLeft: space[3],
    },
    name: {
      ...typography.bodyStrong,
      color: colors.ink,
    },
    context: {
      ...typography.caption,
      color: colors.ink2,
    },
    preview: {
      marginTop: space[1] / 2,
      ...typography.caption,
      color: colors.ink2,
    },
    time: {
      ...typography.caption,
      color: colors.ink2,
      marginLeft: space[2],
    },
  });
}
