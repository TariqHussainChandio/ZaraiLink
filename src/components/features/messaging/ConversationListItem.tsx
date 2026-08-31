import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Avatar } from '../../../components/ui';
import { useTheme, type Theme } from '../../../theme';
import type { ConversationWithPreview } from '../../../types/messaging';

export interface ConversationListItemProps {
  conversation: ConversationWithPreview;
  onPress: () => void;
}

export function ConversationListItem({ conversation, onPress }: ConversationListItemProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
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

function makeStyles({ colors, spacing, typography }: Theme) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    body: {
      flex: 1,
      marginLeft: spacing.md,
    },
    name: {
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold as any,
      color: colors.text.primary,
    },
    preview: {
      marginTop: spacing.xs / 2,
      fontSize: typography.sizes.sm,
      color: colors.text.secondary,
    },
    time: {
      fontSize: typography.sizes.xs,
      color: colors.text.secondary,
      marginLeft: spacing.sm,
    },
  });
}
