import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ConversationListItem, previewOf } from './ConversationListItem';
import { lightColors } from '../../../theme/colors';
import type { ConversationWithPreview, Message } from '../types/messaging';

const baseConversation: ConversationWithPreview = {
  id: 'conv1',
  participant_one: 'u1',
  participant_two: 'u2',
  created_at: '2026-01-01T00:00:00.000Z',
  participant_one_profile: { id: 'u1', full_name: 'Farmer A', avatar_url: null },
  participant_two_profile: { id: 'u2', full_name: 'Dealer B', avatar_url: null },
  otherParticipant: { id: 'u2', full_name: 'Dealer B', avatar_url: null },
  lastMessage: null,
};

const lastMessage = (overrides: Partial<Message> = {}): Message => ({
  id: 'm1',
  conversation_id: 'conv1',
  sender_id: 'u2',
  body: 'Is this still available?',
  attachments: [],
  read_at: null,
  created_at: '2026-01-02T00:00:00.000Z',
  ...overrides,
});

const withLast = (message: Message): ConversationWithPreview => ({ ...baseConversation, lastMessage: message });
const flat = (style: unknown) => Object.assign({}, ...(Array.isArray(style) ? style.flat(Infinity) : [style]));

describe('ConversationListItem', () => {
  it('renders the other participant name and a plain preview with no messages', async () => {
    await render(<ConversationListItem conversation={baseConversation} userId="u1" unread={false} onPress={() => {}} />);
    expect(screen.getByText('Dealer B')).toBeTruthy();
    expect(screen.getByText('No messages yet')).toBeTruthy();
  });

  it('falls back to "Unknown" when there is no other participant, or the name is empty', async () => {
    const { rerender } = await render(
      <ConversationListItem conversation={{ ...baseConversation, otherParticipant: null }} userId="u1" unread={false} onPress={() => {}} />,
    );
    expect(screen.getByText('Unknown')).toBeTruthy();
    await rerender(
      <ConversationListItem
        conversation={{ ...baseConversation, otherParticipant: { id: 'u2', full_name: '', avatar_url: null } }}
        userId="u1"
        unread={false}
        onPress={() => {}}
      />,
    );
    expect(screen.getByText('Unknown')).toBeTruthy();
  });

  it('renders the last message body when present', async () => {
    await render(<ConversationListItem conversation={withLast(lastMessage())} userId="u1" unread={false} onPress={() => {}} />);
    expect(screen.getByText('Is this still available?')).toBeTruthy();
  });

  // FA-18: a photo-only message is not a blank preview.
  it('says "Photo" for a photo-only message, and counts several', async () => {
    expect(previewOf(withLast(lastMessage({ body: '', attachments: ['a.jpg'] })), 'u1')).toBe('Photo');
    expect(previewOf(withLast(lastMessage({ body: '', attachments: ['a.jpg', 'b.jpg'] })), 'u1')).toBe('2 photos');
    expect(previewOf(withLast(lastMessage({ body: '  ', attachments: ['a.jpg'] })), 'u1')).toBe('Photo');
  });

  it('prefixes our own last message with "You:"', async () => {
    expect(previewOf(withLast(lastMessage({ sender_id: 'u1' })), 'u1')).toBe('You: Is this still available?');
  });

  // FA-18: unread is a bold name and the notification dot, and it is spoken.
  it('marks an unread conversation with a bold name, the amber dot and "unread" aloud', async () => {
    const { rerender } = await render(<ConversationListItem conversation={withLast(lastMessage())} userId="u1" unread onPress={() => {}} />);
    expect(screen.getByLabelText(/Dealer B, unread/)).toBeTruthy();
    expect(flat(screen.getByTestId('unread-dot').props.style).backgroundColor).toBe(lightColors.module.notifications);
    const unreadName = flat(screen.getByText('Dealer B').props.style);
    await rerender(<ConversationListItem conversation={withLast(lastMessage())} userId="u1" unread={false} onPress={() => {}} />);
    const readName = flat(screen.getByText('Dealer B').props.style);
    expect(unreadName.fontWeight).not.toEqual(readName.fontWeight);
  });

  it('has no dot and does not say "unread" for a read conversation', async () => {
    await render(<ConversationListItem conversation={withLast(lastMessage())} userId="u1" unread={false} onPress={() => {}} />);
    expect(screen.queryByTestId('unread-dot')).toBeNull();
    expect(screen.queryByLabelText(/unread/)).toBeNull();
  });

  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    await render(<ConversationListItem conversation={baseConversation} userId="u1" unread={false} onPress={onPress} />);
    await fireEvent.press(screen.getByText('Dealer B'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
