import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { WriteReviewScreen } from './WriteReviewScreen';
import { createReview, fetchReviewByOrderId } from '../services/reviewsService';
import { fetchOrderById, fetchOrderStatusHistory } from '../../orders/services/ordersService';
import { fetchPaymentByOrderId } from '../../payments/services/paymentsService';
import { useAuthStore } from '../../../state/authStore';
import type { OrdersScreenProps } from '../../../navigation/stacks/OrdersNavigator';

jest.mock('../services/reviewsService', () => ({
  createReview: jest.fn(),
  fetchReviewByOrderId: jest.fn(),
}));
jest.mock('../../orders/services/ordersService', () => ({
  fetchOrderById: jest.fn(),
  fetchOrderStatusHistory: jest.fn(),
}));
jest.mock('../../payments/services/paymentsService', () => ({
  fetchPaymentByOrderId: jest.fn(),
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
  (fetchReviewByOrderId as jest.Mock).mockReset().mockResolvedValue(null);
  (fetchOrderStatusHistory as jest.Mock).mockReset().mockResolvedValue([]);
  (fetchPaymentByOrderId as jest.Mock).mockReset().mockResolvedValue(null);
  (fetchOrderById as jest.Mock).mockReset().mockResolvedValue({
    id: 'order-1',
    order_items: [{ id: 'i1', listing_id: 'listing-1', quantity: 2, unit_price: 100, listing: { title: 'Wheat seeds', unit: 'kg' } }],
    seller: { id: 'seller-1', full_name: 'Green Farms' },
  });
  useAuthStore.setState({ user: { id: 'buyer-1' } as never });
});

describe('WriteReviewScreen', () => {
  it('starts unrated, with Submit unavailable until a rating is chosen (MK-23)', async () => {
    await renderWithQuery(<WriteReviewScreen {...makeProps()} />);
    expect(screen.getByRole('adjustable', { name: 'Your rating' }).props.accessibilityValue).toMatchObject({ text: 'Not rated' });
    expect(screen.getByRole('button', { name: 'Submit review' }).props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('says what is being reviewed and from whom', async () => {
    await renderWithQuery(<WriteReviewScreen {...makeProps()} />);
    expect(await screen.findByText('Wheat seeds')).toBeTruthy();
    expect(screen.getByText('from Green Farms')).toBeTruthy();
  });

  it('enables Submit once a star is pressed', async () => {
    await renderWithQuery(<WriteReviewScreen {...makeProps()} />);
    await fireEvent.press(screen.getByTestId('rating-star-3'));
    expect(screen.getByRole('adjustable').props.accessibilityValue).toMatchObject({ now: 3, text: '3 out of 5 stars' });
    expect(screen.getByRole('button', { name: 'Submit review' }).props.accessibilityState).toMatchObject({ disabled: false });
  });

  it('submits the review with the rating and comment, confirms in a snackbar, then goes back', async () => {
    mockCreateReview.mockResolvedValue({ id: 'review-1' });
    const props = makeProps();
    await renderWithQuery(<WriteReviewScreen {...props} />);

    await fireEvent.press(screen.getByTestId('rating-star-4'));
    await fireEvent.changeText(screen.getByLabelText('Comment'), 'Very fresh produce.');
    await fireEvent.press(screen.getByRole('button', { name: 'Submit review' }));

    expect(await screen.findByText('Review submitted')).toBeTruthy();
    expect(mockCreateReview).toHaveBeenCalledWith('order-1', 'listing-1', 4, 'Very fresh produce.');
    expect(props.navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('submits a null comment when left blank', async () => {
    mockCreateReview.mockResolvedValue({ id: 'review-1' });
    await renderWithQuery(<WriteReviewScreen {...makeProps()} />);
    await fireEvent.press(screen.getByTestId('rating-star-5'));
    await fireEvent.press(screen.getByRole('button', { name: 'Submit review' }));
    expect(await screen.findByText('Review submitted')).toBeTruthy();
    expect(mockCreateReview).toHaveBeenCalledWith('order-1', 'listing-1', 5, null);
  });

  it('shows a Banner and stays on the screen when submission fails', async () => {
    mockCreateReview.mockRejectedValue(new Error('Review already submitted'));
    const props = makeProps();
    await renderWithQuery(<WriteReviewScreen {...props} />);

    await fireEvent.press(screen.getByTestId('rating-star-2'));
    await fireEvent.press(screen.getByRole('button', { name: 'Submit review' }));

    expect(await screen.findByText("Couldn't submit your review")).toBeTruthy();
    expect(screen.getByText('Review already submitted')).toBeTruthy();
    expect(props.navigation.goBack).not.toHaveBeenCalled();
  });
});
