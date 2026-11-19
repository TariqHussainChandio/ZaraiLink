import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { MessageBubble } from './MessageBubble';
import type { Message } from '../types/messaging';

const baseMessage: Message = {
  id: 'm1',
  conversation_id: 'conv1',
  sender_id: 'u1',
  body: 'Hey, is it still in stock?',
  attachments: [],
  read_at: null,
  created_at: '2026-01-01T10:00:00.000Z',
};

describe('MessageBubble', () => {
  it('renders the message body', async () => {
    await render(<MessageBubble message={baseMessage} isOwn={false} attachmentUrls={{}} />);
    expect(screen.getByText('Hey, is it still in stock?')).toBeTruthy();
  });

  it('renders nothing for body when it is empty', async () => {
    await render(<MessageBubble message={{ ...baseMessage, body: '' }} isOwn={false} attachmentUrls={{}} />);
    expect(screen.queryByText('Hey, is it still in stock?')).toBeNull();
  });

  it('renders a resolved attachment image', async () => {
    const message: Message = { ...baseMessage, body: '', attachments: ['msg/img.jpg'] };
    await render(
      <MessageBubble message={message} isOwn={true} attachmentUrls={{ 'msg/img.jpg': 'https://example.com/img.jpg' }} />,
    );
    expect(screen.getByTestId('attachment-image-msg/img.jpg').props.source.uri).toBe('https://example.com/img.jpg');
  });

  it('is one screen-reader stop naming the sender, the time and the text (A8)', async () => {
    const time = new Date(baseMessage.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const { rerender } = await render(
      <MessageBubble message={baseMessage} isOwn={false} attachmentUrls={{}} senderName="Ali" />,
    );
    expect(screen.getByLabelText(`Ali, ${time}: Hey, is it still in stock?`)).toBeTruthy();

    await rerender(<MessageBubble message={baseMessage} isOwn={true} attachmentUrls={{}} senderName="Ali" />);
    expect(screen.getByLabelText(`You, ${time}: Hey, is it still in stock?`)).toBeTruthy();
  });

  it('renders a placeholder for an attachment whose URL has not resolved yet', async () => {
    const message: Message = { ...baseMessage, body: '', attachments: ['msg/img.jpg'] };
    await render(<MessageBubble message={message} isOwn={true} attachmentUrls={{}} />);
    expect(screen.queryByTestId('attachment-image-msg/img.jpg')).toBeNull();
  });
});
