import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ConsultationMessageBubble } from './ConsultationMessageBubble';
import type { ConsultationMessageWithListing } from '../../../types/expert';

const baseMessage: ConsultationMessageWithListing = {
  id: 'm1',
  consultation_id: 'c1',
  sender_id: 'u1',
  body: 'How do I treat leaf blight?',
  attachments: [],
  recommended_listing_id: null,
  recommended_listing: null,
  created_at: '2026-08-30T10:00:00.000Z',
};

describe('ConsultationMessageBubble', () => {
  it('renders the message body', async () => {
    await render(
      <ConsultationMessageBubble message={baseMessage} isOwn={false} attachmentUrls={{}} />,
    );
    expect(screen.getByText('How do I treat leaf blight?')).toBeTruthy();
  });

  it('renders a recommended listing and calls onPressRecommendation when tapped', async () => {
    const onPressRecommendation = jest.fn();
    const message: ConsultationMessageWithListing = {
      ...baseMessage,
      recommended_listing_id: 'l1',
      recommended_listing: { id: 'l1', title: 'Copper Fungicide', price: 850, unit: 'bottle' },
    };
    await render(
      <ConsultationMessageBubble
        message={message}
        isOwn={false}
        attachmentUrls={{}}
        onPressRecommendation={onPressRecommendation}
      />,
    );
    expect(screen.getByText('Copper Fungicide')).toBeTruthy();
    expect(screen.getByText('Rs. 850 / bottle')).toBeTruthy();
    fireEvent.press(screen.getByText('Copper Fungicide'));
    expect(onPressRecommendation).toHaveBeenCalledWith('l1');
  });

  it('renders an attachment image when a signed URL is available', async () => {
    const message: ConsultationMessageWithListing = { ...baseMessage, body: '', attachments: ['path/to/img.jpg'] };
    await render(
      <ConsultationMessageBubble
        message={message}
        isOwn={true}
        attachmentUrls={{ 'path/to/img.jpg': 'https://example.com/img.jpg' }}
      />,
    );
    expect(screen.getByTestId('attachment-image-path/to/img.jpg').props.source.uri).toBe(
      'https://example.com/img.jpg',
    );
  });
});
