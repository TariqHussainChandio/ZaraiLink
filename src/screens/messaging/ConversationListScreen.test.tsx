import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ConversationListScreen } from './ConversationListScreen';
import { fetchConversations } from '../../services/modules/messaging/messagingService';
import { MESSAGING_ROUTES } from '../../constants/routes';
import { useAuthStore } from '../../store/authStore';
import type { MessagingScreenProps } from '../../navigation/stacks/MessagingNavigator';
import type { ConversationWithPreview } from '../../types/messaging';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const { useEffect } = jest.requireActual('react');
  return {
    ...actual,
    // Runs once on mount instead of react-navigation's real focus/blur lifecycle — sufficient
    // for testing a screen's initial data load without a NavigationContainer.
    useFocusEffect: (effect: () => void) =>
      useEffect(() => {
        effect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []),
  };
});

jest.mock('../../services/modules/messaging/messagingService', () => ({
  fetchConversations: jest.fn(),
}));

const mockFetchConversations = fetchConversations as jest.Mock;

const conversation = (overrides: Partial<ConversationWithPreview> = {}): ConversationWithPreview =>
  ({
    id: 'conv-1',
    participant_one: 'buyer-1',
    participant_two: 'seller-1',
    created_at: '2026-01-01T00:00:00.000Z',
    participant_one_profile: null,
    participant_two_profile: null,
    otherParticipant: { id: 'seller-1', full_name: 'Green Farms', avatar_url: null },
    lastMessage: {
      id: 'm1',
      conversation_id: 'conv-1',
      sender_id: 'seller-1',
      body: 'Is it still available?',
      attachments: [],
      read_at: null,
      created_at: '2026-01-02T00:00:00.000Z',
    },
    ...overrides,
  }) as ConversationWithPreview;

function makeNavigation() {
  return { navigate: jest.fn() } as unknown as MessagingScreenProps<'ConversationList'>['navigation'];
}

beforeEach(() => {
  mockFetchConversations.mockReset();
  useAuthStore.setState({ user: { id: 'buyer-1' } as never });
});

describe('ConversationListScreen', () => {
  it('shows a spinner while loading, then the conversation list', async () => {
    let resolveFetch: (value: ConversationWithPreview[]) => void = () => {};
    mockFetchConversations.mockReturnValue(new Promise(resolve => { resolveFetch = resolve; }));

    await render(<ConversationListScreen navigation={makeNavigation()} route={{} as never} />);
    expect(screen.getByTestId('spinner')).toBeTruthy();

    resolveFetch([conversation()]);
    expect(await screen.findByText('Green Farms')).toBeTruthy();
    expect(screen.getByText('Is it still available?')).toBeTruthy();
  });

  it('shows an empty state when there are no conversations', async () => {
    mockFetchConversations.mockResolvedValue([]);
    await render(<ConversationListScreen navigation={makeNavigation()} route={{} as never} />);
    expect(await screen.findByText('No conversations yet')).toBeTruthy();
  });

  it('navigates to Chat with the conversation id and other participant name', async () => {
    mockFetchConversations.mockResolvedValue([conversation()]);
    const navigation = makeNavigation();
    await render(<ConversationListScreen navigation={navigation} route={{} as never} />);

    await fireEvent.press(await screen.findByText('Green Farms'));
    expect(navigation.navigate).toHaveBeenCalledWith(MESSAGING_ROUTES.Chat, {
      conversationId: 'conv-1',
      otherUserName: 'Green Farms',
    });
  });

  it("falls back to 'Unknown' when the other participant is missing", async () => {
    mockFetchConversations.mockResolvedValue([conversation({ otherParticipant: null })]);
    const navigation = makeNavigation();
    await render(<ConversationListScreen navigation={navigation} route={{} as never} />);

    await fireEvent.press(await screen.findByText('Unknown'));
    expect(navigation.navigate).toHaveBeenCalledWith(MESSAGING_ROUTES.Chat, {
      conversationId: 'conv-1',
      otherUserName: 'Unknown',
    });
  });
});
