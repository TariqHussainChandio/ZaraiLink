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

  it('shows the date in the app format, not the phone locale', async () => {
    await render(<ReviewCard review={review({ created_at: '2020-01-05T10:00:00.000Z' })} />);
    expect(screen.getByText('5 Jan 2020')).toBeTruthy();
  });

  it('falls back to "A buyer" when the buyer is missing', async () => {
    await render(<ReviewCard review={review({ buyer: undefined })} />);
    expect(screen.getByText('A buyer')).toBeTruthy();
  });

  it('omits the comment line when there is no comment', async () => {
    await render(<ReviewCard review={review({ comment: null })} />);
    expect(screen.queryByText('Great quality seeds, fast delivery.')).toBeNull();
  });
});
