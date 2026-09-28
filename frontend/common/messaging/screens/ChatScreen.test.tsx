import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { ChatScreen } from './ChatScreen';
import {
  fetchMessages,
  markConversationRead,
  resolveAttachmentUrls,
  sendMessage,
  uploadMessageAttachments,
} from '../services/messagingService';
import { useRealtimeMessages } from '../../../hooks/realtime/useRealtimeMessages';
import { useAuthStore } from '../../../state/authStore';
import type { MessagingScreenProps } from '../../../navigation/stacks/MessagingNavigator';
import type { Message } from '../types/messaging';

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

jest.mock('../services/messagingService', () => ({
  fetchMessages: jest.fn(),
  markConversationRead: jest.fn(),
  resolveAttachmentUrls: jest.fn(),
  sendMessage: jest.fn(),
  uploadMessageAttachments: jest.fn(),
}));

jest.mock('../../../hooks/realtime/useRealtimeMessages', () => ({
  useRealtimeMessages: jest.fn(),
}));

const mockFetchMessages = fetchMessages as jest.Mock;
const mockMarkConversationRead = markConversationRead as jest.Mock;
const mockResolveAttachmentUrls = resolveAttachmentUrls as jest.Mock;
const mockSendMessage = sendMessage as jest.Mock;
const mockUploadMessageAttachments = uploadMessageAttachments as jest.Mock;
const mockUseRealtimeMessages = useRealtimeMessages as jest.Mock;

const message = (overrides: Partial<Message> = {}): Message => ({
  id: 'm1',
  conversation_id: 'conv-1',
  sender_id: 'seller-1',
  body: 'Hello, is it still in stock?',
  attachments: [],
  read_at: null,
  created_at: '2026-01-01T10:00:00.000Z',
  ...overrides,
});

function makeProps() {
  return {
    navigation: {},
    route: { params: { conversationId: 'conv-1', otherUserName: 'Green Farms' } },
  } as unknown as MessagingScreenProps<'Chat'>;
}

beforeEach(() => {
  mockFetchMessages.mockReset();
  mockMarkConversationRead.mockReset().mockResolvedValue(undefined);
  mockResolveAttachmentUrls.mockReset().mockResolvedValue({});
  mockSendMessage.mockReset();
  mockUploadMessageAttachments.mockReset();
  mockUseRealtimeMessages.mockReset();
  useAuthStore.setState({ user: { id: 'buyer-1' } as never });
});

describe('ChatScreen', () => {
  it('loads and renders messages, marking the conversation read', async () => {
    mockFetchMessages.mockResolvedValue([message()]);
    await renderWithQuery(<ChatScreen {...makeProps()} />);

    expect(await screen.findByText('Hello, is it still in stock?')).toBeTruthy();
    expect(mockMarkConversationRead).toHaveBeenCalledWith('conv-1');
  });

  it('shows a retryable error state when loading fails', async () => {
    mockFetchMessages.mockRejectedValueOnce(new Error('offline'));
    await renderWithQuery(<ChatScreen {...makeProps()} />);
    expect(await screen.findByText("Couldn't load messages")).toBeTruthy();

    mockFetchMessages.mockResolvedValueOnce([message()]);
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('Hello, is it still in stock?')).toBeTruthy();
  });

  it('sends a text message and appends it to the list', async () => {
    mockFetchMessages.mockResolvedValue([]);
    const sentMessage = message({ id: 'm2', sender_id: 'buyer-1', body: 'Yes please!' });
    mockSendMessage.mockResolvedValue(sentMessage);
    await renderWithQuery(<ChatScreen {...makeProps()} />);
    await screen.findByPlaceholderText('Type a message...');

    await fireEvent.changeText(screen.getByPlaceholderText('Type a message...'), 'Yes please!');
    await fireEvent.press(screen.getByLabelText('Send message'));

    expect(mockSendMessage).toHaveBeenCalledWith('conv-1', 'Yes please!', []);
    expect(mockUploadMessageAttachments).not.toHaveBeenCalled();
    expect(await screen.findByText('Yes please!')).toBeTruthy();
  });

  it('resolves attachment URLs for messages that include attachments', async () => {
    mockFetchMessages.mockResolvedValue([message({ id: 'm3', body: '', attachments: ['conv-1/seller-1/img.jpg'] })]);
    mockResolveAttachmentUrls.mockResolvedValue({ 'conv-1/seller-1/img.jpg': 'https://example.com/img.jpg' });
    await renderWithQuery(<ChatScreen {...makeProps()} />);

    expect(await screen.findByTestId('attachment-image-conv-1/seller-1/img.jpg')).toBeTruthy();
    expect(mockResolveAttachmentUrls).toHaveBeenCalledWith(['conv-1/seller-1/img.jpg']);
  });
});
