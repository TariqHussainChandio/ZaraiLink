import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
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


jest.mock('../../../utils/photoPicker', () => ({ pickPhotos: jest.fn() }));

const props = makeProps();
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const type = async (text: string) => {
  await fireEvent.changeText(await screen.findByLabelText('Message'), text);
  await fireEvent.press(screen.getByLabelText('Send message'));
};

describe('ChatScreen', () => {
  it('loads and renders messages, marking the conversation read', async () => {
    mockFetchMessages.mockResolvedValue([message()]);
    await renderWithQuery(<ChatScreen {...props} />);

    expect(await screen.findByLabelText(/Green Farms, .*: Hello, is it still in stock\?/)).toBeTruthy();
    expect(screen.getByText('Hello, is it still in stock?')).toBeTruthy();
    expect(mockMarkConversationRead).toHaveBeenCalledWith('conv-1');
  });

  it('says so when the conversation has no messages, and still lets the person write', async () => {
    mockFetchMessages.mockResolvedValue([]);
    await renderWithQuery(<ChatScreen {...props} />);
    expect(await screen.findByText('No messages yet')).toBeTruthy();
    expect(screen.getByLabelText('Message')).toBeTruthy();
  });

  it('shows a retryable error, not an empty chat, when loading fails', async () => {
    mockFetchMessages.mockRejectedValueOnce(new Error('offline'));
    await renderWithQuery(<ChatScreen {...props} />);
    expect(await screen.findByText("Couldn't load messages")).toBeTruthy();
    expect(screen.queryByText('No messages yet')).toBeNull();

    mockFetchMessages.mockResolvedValueOnce([message()]);
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('Hello, is it still in stock?')).toBeTruthy();
  });

  // FA-03: the bubble is there at once, then settles.
  it('shows a sent message at once as "Sending…", and as sent when the server answers', async () => {
    mockFetchMessages.mockResolvedValue([]);
    const reply = deferred<Message>();
    mockSendMessage.mockReturnValue(reply.promise);
    await renderWithQuery(<ChatScreen {...props} />);

    await type('Yes please!');
    expect(await screen.findByText('Sending…')).toBeTruthy();
    expect(screen.getByText('Yes please!')).toBeTruthy();
    expect(mockSendMessage).toHaveBeenCalledWith('conv-1', 'Yes please!', []);
    expect(mockUploadMessageAttachments).not.toHaveBeenCalled();
    // The composer is free again straight away.
    await waitFor(() => expect(screen.getByLabelText('Message').props.value).toBe(''));

    reply.resolve(message({ id: 'm2', sender_id: 'buyer-1', body: 'Yes please!' }));
    await waitFor(() => expect(screen.queryByText('Sending…')).toBeNull());
    expect(screen.getAllByText('Yes please!')).toHaveLength(1);
  });

  it('keeps a failed message as "Not sent · Tap to retry", and sends it once on retry', async () => {
    mockFetchMessages.mockResolvedValue([]);
    mockSendMessage.mockRejectedValueOnce(new Error('offline'));
    await renderWithQuery(<ChatScreen {...props} />);

    await type('Is delivery possible?');
    expect(await screen.findByText('Not sent · Tap to retry')).toBeTruthy();
    expect(screen.getByText('Is delivery possible?')).toBeTruthy();

    mockSendMessage.mockResolvedValueOnce(message({ id: 'm9', sender_id: 'buyer-1', body: 'Is delivery possible?' }));
    await fireEvent.press(screen.getByText('Not sent · Tap to retry'));
    await waitFor(() => expect(screen.queryByText('Not sent · Tap to retry')).toBeNull());
    expect(mockSendMessage).toHaveBeenCalledTimes(2);
    expect(screen.getAllByText('Is delivery possible?')).toHaveLength(1);
  });

  // The API has no idempotency key for messages: a reply lost on a bad connection must not become two messages.
  it('does not post a second time when the first try had got through', async () => {
    mockFetchMessages.mockResolvedValueOnce([]);
    mockSendMessage.mockRejectedValueOnce(new Error('connection lost after the server saved it'));
    await renderWithQuery(<ChatScreen {...props} />);

    await type('Ready at 5');
    const retry = await screen.findByText('Not sent · Tap to retry');

    // The server already has it.
    mockFetchMessages.mockResolvedValue([message({ id: 'saved', sender_id: 'buyer-1', body: 'Ready at 5' })]);
    await fireEvent.press(retry);
    await waitFor(() => expect(screen.queryByText('Not sent · Tap to retry')).toBeNull());
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('Ready at 5')).toHaveLength(1);
  });

  it('opens a photo in the viewer, labelled with who sent it', async () => {
    mockFetchMessages.mockResolvedValue([message({ id: 'm3', body: '', attachments: ['conv-1/seller-1/img.jpg'] })]);
    mockResolveAttachmentUrls.mockResolvedValue({ 'conv-1/seller-1/img.jpg': 'https://example.com/img.jpg' });
    await renderWithQuery(<ChatScreen {...props} />);

    await fireEvent.press(await screen.findByTestId('attachment-image-conv-1/seller-1/img.jpg'));
    expect(await screen.findByLabelText('Photo 1 of 1 from Green Farms')).toBeTruthy();
    expect(screen.getByLabelText('Close photos')).toBeTruthy();
  });
});
