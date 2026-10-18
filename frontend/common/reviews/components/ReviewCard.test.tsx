import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ReviewCard } from './ReviewCard';
import type { ReviewWithBuyer } from '../types/reviews';

const review = (overrides: Partial<ReviewWithBuyer> = {}): ReviewWithBuyer =>
  ({
    id: 'r1',
    order_id: 'o1',
    listing_id: 'l1',
    buyer_id: 'b1',
    seller_id: 's1',
    rating: 4,
    comment: 'Great quality seeds, fast delivery.',
    created_at: '2026-01-05T10:00:00.000Z',
    buyer: { id: 'b1', full_name: 'Bilal Ahmed', avatar_url: null },
    ...overrides,
  }) as ReviewWithBuyer;

describe('ReviewCard', () => {
  it("renders the buyer's name, date, and comment", async () => {
    await render(<ReviewCard review={review()} />);
    expect(screen.getByText('Bilal Ahmed')).toBeTruthy();
    expect(screen.getByText('Great quality seeds, fast delivery.')).toBeTruthy();
  });

  it('falls back to "Unknown buyer" when the buyer is missing', async () => {
    await render(<ReviewCard review={review({ buyer: undefined })} />);
    expect(screen.getByText('Unknown buyer')).toBeTruthy();
  });

  it('says nothing about moderation for a visible review', async () => {
    await render(<ReviewCard review={review({ hidden_at: null, hidden_reason: null })} />);
    expect(screen.queryByText('Hidden by a moderator')).toBeNull();
  });

  it('tells the author their review was hidden, and why', async () => {
    await render(
      <ReviewCard review={review({ hidden_at: '2026-10-12T09:00:00.000Z', hidden_reason: 'Abusive language' })} />,
    );
    expect(screen.getByText('Hidden by a moderator')).toBeTruthy();
    expect(
      screen.getByText('Others no longer see this review, and it does not count in ratings. Reason: Abusive language'),
    ).toBeTruthy();
    // The review itself still shows to its author.
    expect(screen.getByText('Great quality seeds, fast delivery.')).toBeTruthy();
  });

  it('omits the comment line when there is no comment', async () => {
    await render(<ReviewCard review={review({ comment: null })} />);
    expect(screen.queryByText('Great quality seeds, fast delivery.')).toBeNull();
  });
});
