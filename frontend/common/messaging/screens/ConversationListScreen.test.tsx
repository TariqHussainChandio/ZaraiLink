import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { ConversationListScreen } from './ConversationListScreen';
import { fetchConversations } from '../services/messagingService';
import { APP_TABS, MESSAGING_ROUTES } from '../../constants/routes';
import { useAuthStore } from '../../../state/authStore';
import type { MessagingScreenProps } from '../../../navigation/stacks/MessagingNavigator';
import type { ConversationWithPreview } from '../types/messaging';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const { useEffect } = jest.requireActual('react');
  return {
    ...actual,
    useNavigation: () => ({ navigate: mockNavigate }),
    // Runs once on mount instead of react-navigation's real focus/blur lifecycle — sufficient
    // for testing a screen's initial data load without a NavigationContainer.
    useFocusEffect: (effect: () => void) =>
      useEffect(() => {
        effect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []),
  };
});

jest.mock('../services/messagingService', () => ({
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
  mockNavigate.mockReset();
  useAuthStore.setState({ user: { id: 'buyer-1' } as never, role: 'buyer' });
});

describe('ConversationListScreen', () => {
  it('shows a skeleton while loading, then the conversation list', async () => {
    let resolveFetch: (value: ConversationWithPreview[]) => void = () => {};
    mockFetchConversations.mockReturnValue(new Promise(resolve => { resolveFetch = resolve; }));

    await renderWithQuery(<ConversationListScreen navigation={makeNavigation()} route={{} as never} />);
    expect(screen.queryByText('No conversations yet')).toBeNull();
    expect(screen.queryByText('Green Farms')).toBeNull();

    resolveFetch([conversation()]);
    expect(await screen.findByText('Green Farms')).toBeTruthy();
    expect(screen.getByText('Is it still available?')).toBeTruthy();
  });

  it('shows an empty state with a way to start, for a buyer', async () => {
    mockFetchConversations.mockResolvedValue([]);
    await renderWithQuery(<ConversationListScreen navigation={makeNavigation()} route={{} as never} />);
    expect(await screen.findByText('No conversations yet')).toBeTruthy();
    expect(screen.getByText('Message a seller from a listing or an order to start chatting.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Browse the market'));
    expect(mockNavigate).toHaveBeenCalledWith(APP_TABS.Marketplace);
  });

  // FA-18: an expert is not told to message a seller.
  it('tells an expert where case replies are, with an action to the cases', async () => {
    useAuthStore.setState({ role: 'expert' });
    mockFetchConversations.mockResolvedValue([]);
    await renderWithQuery(<ConversationListScreen navigation={makeNavigation()} route={{} as never} />);
    expect(await screen.findByText(/Replies about a case are in the case itself/)).toBeTruthy();
    expect(screen.queryByText(/seller/)).toBeNull();
    await fireEvent.press(screen.getByText('Open cases'));
    expect(mockNavigate).toHaveBeenCalledWith(APP_TABS.Consultations);
  });

  // FA-18: a failed load is not "No conversations yet".
  it('shows a retryable error, not the empty state, when loading fails', async () => {
    mockFetchConversations.mockRejectedValueOnce(new Error('offline'));
    await renderWithQuery(<ConversationListScreen navigation={makeNavigation()} route={{} as never} />);
    expect(await screen.findByText("Couldn't load your conversations")).toBeTruthy();
    expect(screen.queryByText('No conversations yet')).toBeNull();

    mockFetchConversations.mockResolvedValue([conversation()]);
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('Green Farms')).toBeTruthy();
  });

  it("marks only conversations whose last message is the other person's and unread", async () => {
    mockFetchConversations.mockResolvedValue([
      conversation(),
      conversation({
        id: 'conv-2',
        otherParticipant: { id: 'seller-2', full_name: 'Rana Seeds', avatar_url: null },
        lastMessage: { id: 'm2', conversation_id: 'conv-2', sender_id: 'buyer-1', body: 'Thanks', attachments: [], read_at: null, created_at: '2026-01-02T00:00:00.000Z' },
      }),
      conversation({
        id: 'conv-3',
        otherParticipant: { id: 'seller-3', full_name: 'Old Friend', avatar_url: null },
        lastMessage: { id: 'm3', conversation_id: 'conv-3', sender_id: 'seller-3', body: 'Seen', attachments: [], read_at: '2026-01-02T01:00:00.000Z', created_at: '2026-01-02T00:00:00.000Z' },
      }),
    ]);
    await renderWithQuery(<ConversationListScreen navigation={makeNavigation()} route={{} as never} />);
    await screen.findByText('Green Farms');
    expect(screen.getAllByTestId('unread-dot')).toHaveLength(1);
    expect(screen.getByLabelText(/^Green Farms, unread/)).toBeTruthy();
  });

  it('navigates to Chat with the conversation id and other participant name', async () => {
    mockFetchConversations.mockResolvedValue([conversation()]);
    const navigation = makeNavigation();
    await renderWithQuery(<ConversationListScreen navigation={navigation} route={{} as never} />);

    await fireEvent.press(await screen.findByText('Green Farms'));
    expect(navigation.navigate).toHaveBeenCalledWith(MESSAGING_ROUTES.Chat, {
      conversationId: 'conv-1',
      otherUserName: 'Green Farms',
    });
  });

  it('passes no name to the chat when the other participant is missing, so the chat titles itself', async () => {
    mockFetchConversations.mockResolvedValue([conversation({ otherParticipant: null })]);
    const navigation = makeNavigation();
    await renderWithQuery(<ConversationListScreen navigation={navigation} route={{} as never} />);

    await fireEvent.press(await screen.findByText('Unknown'));
    expect(navigation.navigate).toHaveBeenCalledWith(MESSAGING_ROUTES.Chat, {
      conversationId: 'conv-1',
      otherUserName: '',
    });
  });
});
