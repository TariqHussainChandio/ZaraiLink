import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { EmptyState, Spinner } from '../../components/ui';
import { ConversationListItem } from '../../components/features/messaging/ConversationListItem';
import { MESSAGING_ROUTES } from '../../constants/routes';
import { fetchConversations } from '../../services/modules/messaging/messagingService';
import { useAuthStore } from '../../store/authStore';
import { lightTheme } from '../../theme';
import type { ConversationWithPreview } from '../../types/messaging';
import type { MessagingScreenProps } from '../../navigation/stacks/MessagingNavigator';

export function ConversationListScreen({ navigation }: MessagingScreenProps<'ConversationList'>) {
  const userId = useAuthStore(state => state.user?.id);
  const [conversations, setConversations] = useState<ConversationWithPreview[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      setConversations(await fetchConversations());
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading) return <Spinner fullscreen />;

  return (
    <View style={styles.container}>
      <FlatList
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightTheme.colors.neutral.white,
  },
});
