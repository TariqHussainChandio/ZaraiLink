import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { ReviewModerationScreen } from './ReviewModerationScreen';
import { fetchReviewsForModeration, hideReview, restoreReview } from '../services/adminService';
import type { ReviewWithBuyer } from '../types/reviews';
import { ApiError } from '../../services/api/errors';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const { useEffect } = jest.requireActual('react');
  return {
    ...actual,
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});

jest.mock('../services/adminService', () => ({
  fetchReviewsForModeration: jest.fn(),
  hideReview: jest.fn(),
  restoreReview: jest.fn(),
}));

const mockFetch = fetchReviewsForModeration as jest.Mock;
const mockHide = hideReview as jest.Mock;
const mockRestore = restoreReview as jest.Mock;

const review = (overrides: Partial<ReviewWithBuyer> = {}): ReviewWithBuyer => ({
  id: 'review-1',
  buyer_id: 'buyer-1',
  seller_id: 'seller-1',
  order_id: 'order-1',
  listing_id: 'listing-1',
  consultation_id: null,
  rating: 2,
  comment: 'Rude seller',
  hidden_at: null,
  hidden_reason: null,
  created_at: '2026-10-01T10:00:00Z',
  buyer: { id: 'buyer-1', full_name: 'Buyer Bilal' },
  ...overrides,
});

const HIDDEN = review({ hidden_at: '2026-10-02T10:00:00Z', hidden_reason: 'Abusive language' });

beforeEach(() => {
  mockFetch.mockReset();
  mockHide.mockReset();
  mockRestore.mockReset();
});

describe('ReviewModerationScreen', () => {
  it('lists every review, hidden ones marked with their reason', async () => {
    mockFetch.mockResolvedValue([review(), review({ ...HIDDEN, id: 'review-2', comment: 'Spam text' })]);
    await renderWithQuery(<ReviewModerationScreen />);

    expect(await screen.findByText('Rude seller')).toBeTruthy();
    expect(screen.getByText('Spam text')).toBeTruthy();
    expect(screen.getByText('Hidden')).toBeTruthy();
    expect(screen.getByText('Hidden: Abusive language')).toBeTruthy();
    expect(screen.getByText('Hide')).toBeTruthy();
    expect(screen.getByText('Restore')).toBeTruthy();
    // A review is never deleted (A7 decision).
    expect(screen.queryByText(/delete/i)).toBeNull();
  });

  it('hides a review only with a reason', async () => {
    mockFetch.mockResolvedValueOnce([review()]).mockResolvedValue([HIDDEN]);
    mockHide.mockResolvedValue(HIDDEN);
    await renderWithQuery(<ReviewModerationScreen />);
    await screen.findByText('Rude seller');

    await fireEvent.press(screen.getByText('Hide'));
    await fireEvent.press(screen.getByText('Hide review'));
    expect(screen.getByText('Say why the review is hidden')).toBeTruthy();
    expect(mockHide).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Reason'), '  Abusive language ');
    await fireEvent.press(screen.getByText('Hide review'));

    expect(mockHide).toHaveBeenCalledWith('review-1', 'Abusive language');
    expect(await screen.findByText('Review hidden')).toBeTruthy();
    expect(await screen.findByText('Hidden: Abusive language')).toBeTruthy();
  });

  it('restores a hidden review', async () => {
    mockFetch.mockResolvedValueOnce([HIDDEN]).mockResolvedValue([review()]);
    mockRestore.mockResolvedValue(review());
    await renderWithQuery(<ReviewModerationScreen />);
    await screen.findByText('Rude seller');

    await fireEvent.press(screen.getByText('Restore'));

    expect(mockRestore).toHaveBeenCalledWith('review-1');
    expect(await screen.findByText('Review restored')).toBeTruthy();
    expect(await screen.findByText('Hide')).toBeTruthy();
  });

  it('shows a refusal in the banner and keeps the review as it was', async () => {
    mockFetch.mockResolvedValue([HIDDEN]);
    mockRestore.mockRejectedValue(new ApiError({ status: 403, code: 'mfa_required', kind: 'forbidden', message: 'MFA required' }));
    await renderWithQuery(<ReviewModerationScreen />);
    await screen.findByText('Rude seller');

    await fireEvent.press(screen.getByText('Restore'));

    expect(await screen.findByText('This action needs two-step verification.')).toBeTruthy();
    expect(screen.getByText('Hidden: Abusive language')).toBeTruthy();
  });

  it('shows an empty state when there are no reviews', async () => {
    mockFetch.mockResolvedValue([]);
    await renderWithQuery(<ReviewModerationScreen />);
    expect(await screen.findByText('No reviews yet')).toBeTruthy();
  });
});
