import { useFocusEffect } from '@react-navigation/native';
import { MessageCircle } from 'lucide-react-native';
import React, { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { ScreenState } from '../../components';
import { ConversationListItem } from '../components/ConversationListItem';
import { MESSAGING_ROUTES } from '../../constants/routes';
import { useConversations } from '../hooks/messaging';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';
import type { MessagingScreenProps } from '../../../navigation/stacks/MessagingNavigator';

const EMPTY_INBOX = {
  title: 'No messages yet',
  description: 'Open a listing or an order and tap Message to start a chat.',
  icon: MessageCircle,
};

export function ConversationListScreen({ navigation }: MessagingScreenProps<'ConversationList'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const conversations = useConversations(!!userId);
  const { refetch } = conversations;
  // With no signed-in user the query never runs; show the empty inbox instead of a skeleton that never ends.
  const query = userId ? conversations : { ...conversations, data: conversations.data ?? [], isPending: false };

  // Coming back to the inbox shows messages that arrived while a chat was open.
  useFocusEffect(
    useCallback(() => {
      if (userId) refetch();
    }, [userId, refetch]),
  );

  return (
    <View style={styles.container}>
      <ScreenState query={query} errorTitle="Couldn't load your messages" empty={EMPTY_INBOX}>
        {data => (
          <FlashList
            data={data}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <ConversationListItem
                conversation={item}
                onPress={() =>
                  navigation.navigate(MESSAGING_ROUTES.Chat, {
                    conversationId: item.id,
                    otherUserName: item.otherParticipant?.full_name || '',
                  })
                }
              />
            )}
          />
        )}
      </ScreenState>
    </View>
  );
}

function makeStyles({ colors }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
  });
}
