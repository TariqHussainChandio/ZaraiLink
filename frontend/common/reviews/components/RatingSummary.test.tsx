import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { RatingSummary } from './RatingSummary';
import type { Review } from '../types/reviews';

const review = (rating: number, overrides: Partial<Review> = {}): Review => ({
  id: `review-${Math.random()}`,
  order_id: null,
  consultation_id: null,
  buyer_id: 'buyer-1',
  seller_id: 'seller-1',
  listing_id: null,
  rating,
  comment: null,
  created_at: new Date().toISOString(),
  ...overrides,
});

describe('RatingSummary', () => {
  it('shows "No reviews yet" for an empty list', async () => {
    await render(<RatingSummary reviews={[]} />);
    expect(screen.getByText('No reviews yet')).toBeTruthy();
  });

  it('averages the ratings and shows a singular count for exactly one review', async () => {
    await render(<RatingSummary reviews={[review(5)]} />);
    expect(screen.getByText('5.0 (1 review)')).toBeTruthy();
  });

  it('shows a plural count for more than one review', async () => {
    await render(<RatingSummary reviews={[review(5), review(3)]} />);
    expect(screen.getByText('4.0 (2 reviews)')).toBeTruthy();
  });

  it('rounds the average to one decimal place', async () => {
    await render(<RatingSummary reviews={[review(5), review(4), review(3)]} />);
    expect(screen.getByText('4.0 (3 reviews)')).toBeTruthy();
  });
});
