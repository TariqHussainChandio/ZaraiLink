import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { EmptyState, Spinner } from '../../components/ui';
import { ConversationListItem } from '../../components/features/messaging/ConversationListItem';
import { MESSAGING_ROUTES } from '../../constants/routes';
import { useConversations } from '../../hooks/api/messaging';
import { useAuthStore } from '../../store/authStore';
import { useTheme, type Theme } from '../../theme';
import type { MessagingScreenProps } from '../../navigation/stacks/MessagingNavigator';

export function ConversationListScreen({ navigation }: MessagingScreenProps<'ConversationList'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const { data: conversations = [], isPending, refetch } = useConversations(!!userId);

  // Coming back to the inbox shows messages that arrived while a chat was open.
  useFocusEffect(
    useCallback(() => {
      if (userId) refetch();
    }, [userId, refetch]),
  );

  if (isPending && userId) return <Spinner fullscreen />;

  return (
    <View style={styles.container}>
      <FlashList
        data={conversations}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <ConversationListItem
            conversation={item}
            onPress={() =>
              navigation.navigate(MESSAGING_ROUTES.Chat, {
                conversationId: item.id,
                otherUserName: item.otherParticipant?.full_name ?? 'Unknown',
              })
            }
          />
        )}
        ListEmptyComponent={
          <EmptyState
            title="No conversations yet"
            description="Message a seller from a listing or an order to start chatting."
          />
        }
      />
    </View>
  );
}

function makeStyles({ colors }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.surface,
    },
  });
}
