import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { MessageCircle } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { ListGroup, QueryState, ScreenScaffold } from '../../components';
import { ConversationListItem } from '../components/ConversationListItem';
import { APP_TABS, MESSAGING_ROUTES } from '../../constants/routes';
import { isUnread, useConversations } from '../hooks/messaging';
import { useAuthStore } from '../../../state/authStore';
import type { Role } from '../../constants/roles';
import type { MessagingScreenProps } from '../../../navigation/stacks/MessagingNavigator';

interface EmptyCopy {
  description: string;
  actionLabel: string;
  tab: string;
}

/** Where an empty inbox sends each role: the conversations they can start come from there. An expert's replies about a
 * case are in the case itself, so theirs points to Cases (FA-18). */
const EMPTY_BY_ROLE: Partial<Record<Role, EmptyCopy>> = {
  farmer: { description: 'Message a buyer from an order, or a seller from a listing.', actionLabel: 'View orders', tab: APP_TABS.Orders },
  buyer: { description: 'Message a seller from a listing or an order to start chatting.', actionLabel: 'Browse the market', tab: APP_TABS.Marketplace },
  dealer: { description: 'Message a buyer from an order, or a seller from a listing.', actionLabel: 'View orders', tab: APP_TABS.Orders },
  expert: {
    description: 'Replies about a case are in the case itself. Messages from other people appear here.',
    actionLabel: 'Open cases',
    tab: APP_TABS.Consultations,
  },
};
const EMPTY_DEFAULT: EmptyCopy = {
  description: 'Message a seller from a listing or an order to start chatting.',
  actionLabel: 'Browse the market',
  tab: APP_TABS.Marketplace,
};

export function ConversationListScreen({ navigation }: MessagingScreenProps<'ConversationList'>) {
  const userId = useAuthStore(state => state.user?.id);
  const role = useAuthStore(state => state.role);
  // Untyped: the tab to open belongs to whichever shell the role has, and navigate hands the action to the one that has it.
  const anyNavigation = useNavigation<any>();
  const query = useConversations(!!userId);
  const { data: conversations = [], refetch } = query;
  // Only a pull shows the spinner; the refetch on every return to the inbox is quiet.
  const [pulling, setPulling] = useState(false);
  const pull = async () => {
    setPulling(true);
    try {
      await refetch();
    } finally {
      setPulling(false);
    }
  };

  // Coming back to the inbox shows messages that arrived while a chat was open.
  useFocusEffect(
    useCallback(() => {
      if (userId) refetch();
    }, [userId, refetch]),
  );

  const emptyCopy = (role && EMPTY_BY_ROLE[role]) || EMPTY_DEFAULT;

  return (
    <ScreenScaffold onRefresh={pull} refreshing={pulling}>
      <QueryState
        query={query}
        isEmpty={conversations.length === 0}
        empty={{
          icon: MessageCircle,
          title: 'No conversations yet',
          description: emptyCopy.description,
          actionLabel: emptyCopy.actionLabel,
          onAction: () => anyNavigation.navigate(emptyCopy.tab),
        }}
        failureTitle="Couldn't load your conversations"
      >
        <ListGroup>
          {conversations.map(item => (
            <ConversationListItem
              key={item.id}
              conversation={item}
              userId={userId}
              unread={isUnread(item, userId)}
              onPress={() =>
                navigation.navigate(MESSAGING_ROUTES.Chat, {
                  conversationId: item.id,
                  otherUserName: item.otherParticipant?.full_name || '',
                })
              }
            />
          ))}
        </ListGroup>
      </QueryState>
    </ScreenScaffold>
  );
}
