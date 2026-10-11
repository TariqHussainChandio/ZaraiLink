import React from 'react';
import { Alert } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { OrderDetailScreen } from './OrderDetailScreen';
import {
  fetchOrderById,
  fetchOrderStatusHistory,
  updateOrderStatus,
} from '../services/ordersService';
import { findOrCreateConversation } from '../../messaging/services/messagingService';
import {
  fetchPaymentByOrderId,
  markPaymentFailed,
  markPaymentReceived,
} from '../../payments/services/paymentsService';
import { fetchReviewByOrderId } from '../../reviews/services/reviewsService';
import { useAuthStore } from '../../../state/authStore';
import { createTestQueryClient } from '../../../testUtils/renderWithProviders';
import { APP_TABS, MESSAGING_ROUTES, ORDERS_ROUTES } from '../../constants/routes';
import type { OrderWithItems } from '../types/orders';

const mockNavigate = jest.fn();
const mockTabNavigate = jest.fn();
const routeParams = { orderId: 'order-1' };

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      navigate: mockNavigate,
      getParent: () => ({ navigate: mockTabNavigate }),
    }),
    useRoute: () => ({ params: routeParams }),
  };
});

jest.mock('../services/ordersService', () => ({
  fetchOrderById: jest.fn(),
  fetchOrderStatusHistory: jest.fn(),
  updateOrderStatus: jest.fn(),
}));
jest.mock('../../messaging/services/messagingService', () => ({
  findOrCreateConversation: jest.fn(),
}));
jest.mock('../../payments/services/paymentsService', () => ({
  fetchPaymentByOrderId: jest.fn(),
  markPaymentReceived: jest.fn(),
  markPaymentFailed: jest.fn(),
}));
jest.mock('../../reviews/services/reviewsService', () => ({
  fetchReviewByOrderId: jest.fn(),
}));

const mockFetchOrderById = fetchOrderById as jest.Mock;
const mockFetchOrderStatusHistory = fetchOrderStatusHistory as jest.Mock;
const mockUpdateOrderStatus = updateOrderStatus as jest.Mock;
const mockFindOrCreateConversation = findOrCreateConversation as jest.Mock;
const mockFetchPaymentByOrderId = fetchPaymentByOrderId as jest.Mock;
const mockMarkPaymentReceived = markPaymentReceived as jest.Mock;
const mockMarkPaymentFailed = markPaymentFailed as jest.Mock;
const mockFetchReviewByOrderId = fetchReviewByOrderId as jest.Mock;

const order = (overrides: Partial<OrderWithItems> = {}): OrderWithItems =>
  ({
    id: 'order-1',
    buyer_id: 'buyer-1',
    seller_id: 'seller-1',
    status: 'pending',
    product_subtotal: 500,
    delivery_charge: 50,
    total: 550,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    order_items: [
      { id: 'item-1', order_id: 'order-1', listing_id: 'listing-1', quantity: 2, unit_price: 250, created_at: '2026-01-01T00:00:00.000Z', listing: { title: 'Wheat seeds', unit: 'kg' } },
    ],
    buyer: { id: 'buyer-1', full_name: 'Ali Khan' },
    seller: { id: 'seller-1', full_name: 'Green Farms' },
    ...overrides,
  }) as OrderWithItems;

function renderScreen() {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <OrderDetailScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockNavigate.mockReset();
  mockTabNavigate.mockReset();
  mockFetchOrderById.mockReset();
  mockFetchOrderStatusHistory.mockReset().mockResolvedValue([]);
  mockUpdateOrderStatus.mockReset();
  mockFindOrCreateConversation.mockReset();
  mockFetchPaymentByOrderId.mockReset().mockResolvedValue(null);
  mockMarkPaymentReceived.mockReset();
  mockMarkPaymentFailed.mockReset();
  mockFetchReviewByOrderId.mockReset().mockResolvedValue(null);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('OrderDetailScreen', () => {
  it('loads and renders the order total, items, and parties', async () => {
    useAuthStore.setState({ user: { id: 'buyer-1' } as never });
    mockFetchOrderById.mockResolvedValue(order());
    await renderScreen();

    // The total shows twice: the hero figure and the price breakdown's total line (BR-09).
    expect(await screen.findAllByText('Rs 550')).toHaveLength(2);
    expect(screen.getByText('2 kg × Wheat seeds')).toBeTruthy();
    expect(screen.getByText('Ali Khan')).toBeTruthy();
    expect(screen.getByText('Green Farms')).toBeTruthy();
  });

  it('still shows an order whose status this build does not know yet, in its history and timeline', async () => {
    // An installed build meets API values before it is updated; the screen must not crash.
    useAuthStore.setState({ user: { id: 'buyer-1' } as never });
    mockFetchOrderById.mockResolvedValue(order({ status: 'on_hold' as never }));
    mockFetchOrderStatusHistory.mockResolvedValue([
      { id: 'h1', order_id: 'order-1', from_status: 'ready', to_status: 'on_hold' as never, changed_by: 'seller-1', created_at: '2026-01-02T00:00:00.000Z' },
    ]);
    await renderScreen();

    expect(await screen.findByText('Ready for dispatch → On hold')).toBeTruthy();
    expect(screen.getAllByText('On hold').length).toBeGreaterThan(0);
  });

  it('shows a history entry that leaves a status this build does not know', async () => {
    useAuthStore.setState({ user: { id: 'buyer-1' } as never });
    mockFetchOrderById.mockResolvedValue(order({ status: 'completed' }));
    mockFetchOrderStatusHistory.mockResolvedValue([
      { id: 'h2', order_id: 'order-1', from_status: 'on_hold' as never, to_status: 'completed', changed_by: 'seller-1', created_at: '2026-01-03T00:00:00.000Z' },
    ]);
    await renderScreen();

    expect(await screen.findByText('On hold → Completed')).toBeTruthy();
  });

  it('lets the buyer pay when no payment exists yet', async () => {
    useAuthStore.setState({ user: { id: 'buyer-1' } as never });
    mockFetchOrderById.mockResolvedValue(order());
    await renderScreen();
    await screen.findAllByText('Rs 550');

    await fireEvent.press(screen.getByText('Pay Now'));
    expect(mockNavigate).toHaveBeenCalledWith(ORDERS_ROUTES.PaymentMethod, { orderId: 'order-1' });
  });

  it('lets the seller confirm a pending order', async () => {
    useAuthStore.setState({ user: { id: 'seller-1' } as never });
    mockFetchOrderById.mockResolvedValue(order());
    mockUpdateOrderStatus.mockResolvedValue(undefined);
    await renderScreen();
    await screen.findAllByText('Rs 550');

    await fireEvent.press(screen.getByText('Confirm Order'));

    await waitFor(() => expect(mockUpdateOrderStatus).toHaveBeenCalledWith('order-1', 'confirmed'));
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('asks the seller to confirm a dispatch, then dispatches the ready order (D5)', async () => {
    useAuthStore.setState({ user: { id: 'seller-1' } as never });
    mockFetchOrderById.mockResolvedValue(order({ status: 'ready' }));
    mockUpdateOrderStatus.mockResolvedValue(undefined);
    await renderScreen();
    await screen.findAllByText('Rs 550');
    // Ready is dispatched, never completed straight away.
    expect(screen.queryByText('Mark Completed')).toBeNull();

    await fireEvent.press(screen.getByText('Mark Dispatched'));
    expect(screen.getByText(/The stock leaves your inventory now/)).toBeTruthy();
    expect(mockUpdateOrderStatus).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Dispatch now'));
    await waitFor(() => expect(mockUpdateOrderStatus).toHaveBeenCalledWith('order-1', 'dispatched'));
  });

  it('dispatches nothing when the seller says not yet', async () => {
    useAuthStore.setState({ user: { id: 'seller-1' } as never });
    mockFetchOrderById.mockResolvedValue(order({ status: 'ready' }));
    await renderScreen();
    await screen.findAllByText('Rs 550');

    await fireEvent.press(screen.getByText('Mark Dispatched'));
    await fireEvent.press(screen.getByText('Not yet'));

    expect(mockUpdateOrderStatus).not.toHaveBeenCalled();
  });

  it('shows the shortage message when a dispatch is refused (D6)', async () => {
    useAuthStore.setState({ user: { id: 'seller-1' } as never });
    mockFetchOrderById.mockResolvedValue(order({ status: 'ready' }));
    mockUpdateOrderStatus.mockRejectedValue(new Error('Not enough stock to dispatch this order — needs 3 but only 2 in stock.'));
    await renderScreen();
    await screen.findAllByText('Rs 550');

    await fireEvent.press(screen.getByText('Mark Dispatched'));
    await fireEvent.press(screen.getByText('Dispatch now'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Could not update order',
        'Not enough stock to dispatch this order — needs 3 but only 2 in stock.',
      ),
    );
  });

  it('lets the seller complete a dispatched order, and offers no cancel', async () => {
    useAuthStore.setState({ user: { id: 'seller-1' } as never });
    mockFetchOrderById.mockResolvedValue(order({ status: 'dispatched' }));
    mockUpdateOrderStatus.mockResolvedValue(undefined);
    await renderScreen();
    await screen.findAllByText('Rs 550');
    expect(screen.queryByText('Cancel Order')).toBeNull();
    expect(screen.queryByText('Mark Dispatched')).toBeNull();

    await fireEvent.press(screen.getByText('Mark Completed'));

    await waitFor(() => expect(mockUpdateOrderStatus).toHaveBeenCalledWith('order-1', 'completed'));
  });

  it('offers the buyer no dispatch', async () => {
    useAuthStore.setState({ user: { id: 'buyer-1' } as never });
    mockFetchOrderById.mockResolvedValue(order({ status: 'ready' }));
    await renderScreen();
    await screen.findAllByText('Rs 550');

    expect(screen.queryByText('Mark Dispatched')).toBeNull();
  });

  it('shows an alert when a status update fails', async () => {
    useAuthStore.setState({ user: { id: 'seller-1' } as never });
    mockFetchOrderById.mockResolvedValue(order());
    mockUpdateOrderStatus.mockRejectedValue(new Error('Order already updated'));
    await renderScreen();
    await screen.findAllByText('Rs 550');

    await fireEvent.press(screen.getByText('Confirm Order'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Could not update order', 'Order already updated'),
    );
  });

  it('lets the seller mark a pending payment as received', async () => {
    useAuthStore.setState({ user: { id: 'seller-1' } as never });
    mockFetchOrderById.mockResolvedValue(order({ status: 'confirmed' }));
    mockFetchPaymentByOrderId.mockResolvedValue({
      id: 'payment-1',
      order_id: 'order-1',
      buyer_id: 'buyer-1',
      amount: 550,
      currency: 'PKR',
      method: 'bank_transfer',
      provider: 'manual',
      provider_transaction_ref: null,
      status: 'pending',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    });
    mockMarkPaymentReceived.mockResolvedValue({});
    await renderScreen();
    await screen.findAllByText('Rs 550');

    await fireEvent.press(screen.getByText('Mark Payment Received'));
    await waitFor(() => expect(mockMarkPaymentReceived).toHaveBeenCalledWith('payment-1'));
  });

  it('starts a conversation with the seller and navigates to Chat', async () => {
    useAuthStore.setState({ user: { id: 'buyer-1' } as never });
    mockFetchOrderById.mockResolvedValue(order());
    mockFindOrCreateConversation.mockResolvedValue({ id: 'conversation-1' });
    await renderScreen();
    await screen.findAllByText('Rs 550');

    await fireEvent.press(screen.getByText('Message Seller'));

    expect(mockFindOrCreateConversation).toHaveBeenCalledWith('seller-1');
    await waitFor(() =>
      expect(mockTabNavigate).toHaveBeenCalledWith(APP_TABS.Messages, {
        screen: MESSAGING_ROUTES.Chat,
        initial: false,
        params: { conversationId: 'conversation-1', otherUserName: 'Green Farms' },
      }),
    );
  });

  it('lets the buyer write a review for a completed order with no review yet', async () => {
    useAuthStore.setState({ user: { id: 'buyer-1' } as never });
    mockFetchOrderById.mockResolvedValue(order({ status: 'completed' }));
    await renderScreen();
    await screen.findAllByText('Rs 550');

    await fireEvent.press(screen.getByText('Write a Review'));

    expect(mockNavigate).toHaveBeenCalledWith(ORDERS_ROUTES.WriteReview, {
      orderId: 'order-1',
      listingId: 'listing-1',
      sellerId: 'seller-1',
    });
  });
});
