import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Avatar } from '../../../components/ui';
import { lightTheme } from '../../../theme';
import type { ConversationWithPreview } from '../../../types/messaging';

export interface ConversationListItemProps {
  conversation: ConversationWithPreview;
  onPress: () => void;
}

const { colors, spacing, typography } = lightTheme;

export function ConversationListItem({ conversation, onPress }: ConversationListItemProps) {
  const name = conversation.otherParticipant?.full_name ?? 'Unknown';

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <Avatar name={name} uri={conversation.otherParticipant?.avatar_url} size={44} />
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

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.gray100,
  },
  body: {
    flex: 1,
    marginLeft: spacing.md,
  },
  name: {
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold as any,
    color: colors.neutral.gray900,
  },
  preview: {
    marginTop: spacing.xs / 2,
    fontSize: typography.sizes.sm,
    color: colors.neutral.gray500,
  },
  time: {
    fontSize: typography.sizes.xs,
    color: colors.neutral.gray400,
    marginLeft: spacing.sm,
  },
});
