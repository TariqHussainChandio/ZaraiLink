import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { WriteReviewScreen } from './WriteReviewScreen';
import { createReview } from '../services/reviewsService';
import { useAuthStore } from '../../../state/authStore';
import type { OrdersScreenProps } from '../../../navigation/stacks/OrdersNavigator';

jest.mock('../services/reviewsService', () => ({
  createReview: jest.fn(),
}));

const mockCreateReview = createReview as jest.Mock;

function makeProps() {
  return {
    navigation: { goBack: jest.fn() },
    route: { params: { orderId: 'order-1', listingId: 'listing-1', sellerId: 'seller-1' } },
  } as unknown as OrdersScreenProps<'WriteReview'>;
}

beforeEach(() => {
  mockCreateReview.mockReset();
  useAuthStore.setState({ user: { id: 'buyer-1' } as never });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('WriteReviewScreen', () => {
  it('defaults to a 5-star rating', async () => {
    await renderWithQuery(<WriteReviewScreen {...makeProps()} />);
    expect(screen.getByLabelText('Rate 5 stars').props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('Rate 1 star').props.accessibilityState.selected).toBe(true);
  });

  it('changes the rating when a star is pressed', async () => {
    await renderWithQuery(<WriteReviewScreen {...makeProps()} />);
    await fireEvent.press(screen.getByLabelText('Rate 3 stars'));
    expect(screen.getByLabelText('Rate 3 stars').props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('Rate 4 stars').props.accessibilityState.selected).toBe(false);
  });

  it('submits the review with the rating and comment, then goes back', async () => {
    mockCreateReview.mockResolvedValue({ id: 'review-1' });
    const props = makeProps();
    await renderWithQuery(<WriteReviewScreen {...props} />);

    await fireEvent.press(screen.getByLabelText('Rate 4 stars'));
    await fireEvent.changeText(screen.getByLabelText('Comment (optional)'), 'Very fresh produce.');
    await fireEvent.press(screen.getByText('Submit Review'));

    expect(mockCreateReview).toHaveBeenCalledWith('order-1', 'listing-1', 4, 'Very fresh produce.');
    expect(props.navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('submits a null comment when left blank', async () => {
    mockCreateReview.mockResolvedValue({ id: 'review-1' });
    await renderWithQuery(<WriteReviewScreen {...makeProps()} />);
    await fireEvent.press(screen.getByText('Submit Review'));
    expect(mockCreateReview).toHaveBeenCalledWith('order-1', 'listing-1', 5, null);
  });

  it('shows an alert and stays on the screen when submission fails', async () => {
    mockCreateReview.mockRejectedValue(new Error('Review already submitted'));
    const props = makeProps();
    await renderWithQuery(<WriteReviewScreen {...props} />);

    await fireEvent.press(screen.getByText('Submit Review'));

    expect(Alert.alert).toHaveBeenCalledWith('Could not submit review', 'Review already submitted');
    expect(props.navigation.goBack).not.toHaveBeenCalled();
  });
});
