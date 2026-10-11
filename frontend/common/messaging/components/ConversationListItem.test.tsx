import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ConversationListItem } from './ConversationListItem';
import type { ConversationWithPreview } from '../types/messaging';

const baseConversation: ConversationWithPreview = {
  id: 'conv1',
  participant_one: 'u1',
  participant_two: 'u2',
  created_at: '2026-01-01T00:00:00.000Z',
  context_type: null,
  context_id: null,
  participant_one_profile: { id: 'u1', full_name: 'Farmer A', avatar_url: null },
  participant_two_profile: { id: 'u2', full_name: 'Dealer B', avatar_url: null },
  otherParticipant: { id: 'u2', full_name: 'Dealer B', avatar_url: null },
  lastMessage: null,
};

describe('ConversationListItem', () => {
  it('renders the other participant name and a placeholder preview with no messages', async () => {
    await render(<ConversationListItem conversation={baseConversation} onPress={() => {}} />);
    expect(screen.getByText('Dealer B')).toBeTruthy();
    expect(screen.getByText('Say hello 👋')).toBeTruthy();
  });

  it('falls back to "Unknown" when there is no other participant', async () => {
    await render(
      <ConversationListItem conversation={{ ...baseConversation, otherParticipant: null }} onPress={() => {}} />,
    );
    expect(screen.getByText('Unknown')).toBeTruthy();
  });

  it('shows "Unknown" for a participant whose name is empty, never a blank row', async () => {
    await render(
      <ConversationListItem conversation={{ ...baseConversation, otherParticipant: { id: 'u2', full_name: '', avatar_url: null } }} onPress={() => {}} />,
    );
    expect(screen.getByText('Unknown')).toBeTruthy();
  });

  it('renders the last message body when present', async () => {
    const conversation: ConversationWithPreview = {
      ...baseConversation,
      lastMessage: {
        id: 'm1',
        conversation_id: 'conv1',
        sender_id: 'u1',
        body: 'Is this still available?',
        attachments: [],
        read_at: null,
        created_at: '2026-01-02T00:00:00.000Z',
      },
    };
    await render(<ConversationListItem conversation={conversation} onPress={() => {}} />);
    expect(screen.getByText('Is this still available?')).toBeTruthy();
    expect(screen.queryByText('Say hello 👋')).toBeNull();
  });

  // A5 (SRDS §30): the row says what the conversation is about.
  it.each([
    ['listing', 'Listing inquiry'],
    ['order', 'Order'],
    ['consultation', 'Consultation'],
  ] as const)('labels a %s conversation "%s", visibly and to a screen reader', async (type, label) => {
    await render(
      <ConversationListItem
        conversation={{ ...baseConversation, context_type: type, context_id: 'ctx-1' }}
        onPress={() => {}}
      />,
    );
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByLabelText(`Chat with Dealer B, ${label}, No messages yet`)).toBeTruthy();
  });

  it('shows no context label for a conversation from before A5', async () => {
    await render(<ConversationListItem conversation={baseConversation} onPress={() => {}} />);
    for (const label of ['Listing inquiry', 'Order', 'Consultation']) {
      expect(screen.queryByText(label)).toBeNull();
    }
    expect(screen.getByLabelText('Chat with Dealer B, No messages yet')).toBeTruthy();
  });

  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    await render(<ConversationListItem conversation={baseConversation} onPress={onPress} />);
    await fireEvent.press(screen.getByText('Dealer B'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
