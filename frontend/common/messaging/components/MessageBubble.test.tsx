import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { MessageBubble } from './MessageBubble';
import { formatTime } from '../../../utils/dates';
import { lightColors } from '../../../theme/colors';
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
const time = formatTime(baseMessage.created_at);

describe('MessageBubble', () => {
  it('renders the message body', async () => {
    await render(<MessageBubble message={baseMessage} isOwn={false} attachmentUrls={{}} />);
    expect(screen.getByText('Hey, is it still in stock?')).toBeTruthy();
  });

  it('renders nothing for body when it is empty', async () => {
    await render(<MessageBubble message={{ ...baseMessage, body: '' }} isOwn={false} attachmentUrls={{}} />);
    expect(screen.queryByText('Hey, is it still in stock?')).toBeNull();
  });

  // FA-10: one element per bubble that says who, when, what and how many photos.
  it('is one accessible element naming who sent it, when, the words and the photos', async () => {
    const message: Message = { ...baseMessage, attachments: ['a.jpg', 'b.jpg'] };
    await render(<MessageBubble message={message} isOwn={false} senderName="Green Farms" attachmentUrls={{ 'a.jpg': 'https://x/a', 'b.jpg': 'https://x/b' }} />);
    expect(screen.getByLabelText(`Green Farms, ${time}: Hey, is it still in stock?, 2 photos`)).toBeTruthy();
  });

  it('says "You" for our own message and whether it was read', async () => {
    const { rerender } = await render(<MessageBubble message={baseMessage} isOwn attachmentUrls={{}} />);
    expect(screen.getByLabelText(`You, ${time}: Hey, is it still in stock?, sent`)).toBeTruthy();
    await rerender(<MessageBubble message={{ ...baseMessage, read_at: '2026-01-01T10:05:00.000Z' }} isOwn attachmentUrls={{}} />);
    expect(screen.getByLabelText(`You, ${time}: Hey, is it still in stock?, read`)).toBeTruthy();
  });

  it('reads a photo-only message without a stray colon', async () => {
    const message: Message = { ...baseMessage, body: '', attachments: ['a.jpg'] };
    await render(<MessageBubble message={message} isOwn={false} senderName="Ali" attachmentUrls={{}} />);
    expect(screen.getByLabelText(`Ali, ${time}, 1 photo`)).toBeTruthy();
  });

  it('renders a resolved attachment image and opens it on the photo that was tapped', async () => {
    const onOpenPhotos = jest.fn();
    const message: Message = { ...baseMessage, body: '', attachments: ['msg/one.jpg', 'msg/two.jpg'] };
    await render(
      <MessageBubble
        message={message}
        isOwn
        attachmentUrls={{ 'msg/one.jpg': 'https://example.com/one.jpg', 'msg/two.jpg': 'https://example.com/two.jpg' }}
        onOpenPhotos={onOpenPhotos}
      />,
    );
    expect(screen.getByTestId('attachment-image-msg/one.jpg').props.source.uri).toBe('https://example.com/one.jpg');
    await fireEvent.press(screen.getByTestId('attachment-image-msg/two.jpg'));
    expect(onOpenPhotos).toHaveBeenCalledWith(1);
  });

  it('offers screen readers an "Open photos" action that opens the first photo', async () => {
    const onOpenPhotos = jest.fn();
    const message: Message = { ...baseMessage, attachments: ['a.jpg'] };
    await render(<MessageBubble message={message} isOwn={false} attachmentUrls={{ 'a.jpg': 'https://x/a' }} onOpenPhotos={onOpenPhotos} />);
    const bubble = screen.getByLabelText(new RegExp(`${time}: Hey`));
    expect(bubble.props.accessibilityActions).toEqual([{ name: 'openPhotos', label: 'Open photos' }]);
    await fireEvent(bubble, 'accessibilityAction', { nativeEvent: { actionName: 'openPhotos' } });
    expect(onOpenPhotos).toHaveBeenCalledWith(0);
  });

  it('renders a placeholder for an attachment whose URL has not resolved yet', async () => {
    const message: Message = { ...baseMessage, body: '', attachments: ['msg/img.jpg'] };
    await render(<MessageBubble message={message} isOwn attachmentUrls={{}} />);
    expect(screen.queryByTestId('attachment-image-msg/img.jpg')).toBeNull();
  });

  // FA-03: our own message before the server has it.
  it('shows "Sending…" while the server has not confirmed the message', async () => {
    await render(<MessageBubble message={baseMessage} isOwn delivery="sending" attachmentUrls={{}} />);
    expect(screen.getByText('Sending…')).toBeTruthy();
    expect(screen.getByLabelText(`You, ${time}: Hey, is it still in stock?, sending`)).toBeTruthy();
  });

  it('shows "Not sent · Tap to retry" and retries when pressed', async () => {
    const onRetry = jest.fn();
    await render(<MessageBubble message={baseMessage} isOwn delivery="failed" onRetry={onRetry} attachmentUrls={{}} />);
    expect(screen.getByText('Not sent · Tap to retry')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(`You, ${time}: Hey, is it still in stock?, not sent, double tap to retry`));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  // FA-19: the time on our own bubble is the text colour at full strength (a faded one was 3.9:1).
  it('draws our own time at full opacity', async () => {
    await render(<MessageBubble message={baseMessage} isOwn attachmentUrls={{}} />);
    const style = screen.getByText(time).props.style;
    const flat = Object.assign({}, ...(Array.isArray(style) ? style.flat(Infinity) : [style]));
    expect(flat.opacity).toBeUndefined();
    expect(flat.color).toBe(lightColors.onAccent);
  });
});
