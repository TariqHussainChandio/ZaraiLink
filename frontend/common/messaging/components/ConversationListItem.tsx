import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Avatar } from '../../components';
import { useTheme, type Theme } from '../../../theme';
import type { ConversationWithPreview } from '../types/messaging';

export interface ConversationListItemProps {
  conversation: ConversationWithPreview;
  onPress: () => void;
}

export function ConversationListItem({ conversation, onPress }: ConversationListItemProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // An empty name reads like a missing one, never as a blank row.
  const name = conversation.otherParticipant?.full_name || 'Unknown';

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <Avatar name={name} uri={conversation.otherParticipant?.avatar_url} size={theme.size.avatarMd} />
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.preview} numberOfLines={1}>
          {conversation.lastMessage?.body ?? 'Say hello 👋'}
        </Text>
      </View>
      {conversation.lastMessage ? (
        <Text style={styles.time}>
          {new Date(conversation.lastMessage.created_at).toLocaleDateString()}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

function makeStyles({ colors, space, typography, borders }: Theme) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
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
