import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { OrderDetailScreen } from './OrderDetailScreen';
import { fetchOrderById, fetchOrderStatusHistory, updateOrderStatus } from '../services/ordersService';
import { findOrCreateConversation } from '../../messaging/services/messagingService';
import { fetchPaymentByOrderId, markPaymentFailed, markPaymentReceived } from '../../payments/services/paymentsService';
import { fetchReviewByOrderId } from '../../reviews/services/reviewsService';
import { useAuthStore } from '../../../state/authStore';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
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

const payment = (overrides: object = {}) => ({
  id: 'payment-1',
  order_id: 'order-1',
  buyer_id: 'buyer-1',
  amount: 550,
  currency: 'PKR',
  method: 'cod',
  provider: 'manual',
  provider_transaction_ref: null,
  status: 'pending',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const signIn = (id: 'buyer-1' | 'seller-1' | 'admin-1', role: string) =>
  useAuthStore.setState({ user: { id } as never, role: role as never });

/** The button that confirms inside the open sheet: the screen's own button of the same name sits behind it. */
const sheetButton = (name: string) => screen.getAllByRole('button', { name }).at(-1)!;

beforeEach(() => {
  mockNavigate.mockReset();
  mockTabNavigate.mockReset();
  mockFetchOrderById.mockReset();
  mockFetchOrderStatusHistory.mockReset().mockResolvedValue([]);
  mockUpdateOrderStatus.mockReset().mockResolvedValue(undefined);
  mockFindOrCreateConversation.mockReset();
  mockFetchPaymentByOrderId.mockReset().mockResolvedValue(null);
  mockMarkPaymentReceived.mockReset().mockResolvedValue({});
  mockMarkPaymentFailed.mockReset().mockResolvedValue({});
  mockFetchReviewByOrderId.mockReset().mockResolvedValue(null);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('OrderDetailScreen', () => {
  it('opens with the status and what happens next in words, the total on a plate, and the items', async () => {
    signIn('buyer-1', 'buyer');
    mockFetchOrderById.mockResolvedValue(order());
    await renderWithQuery(<OrderDetailScreen />);

    expect(await screen.findByText('Waiting for Green Farms to confirm your order.')).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
    expect(screen.getByLabelText('Rs 550, Total, delivery included')).toBeTruthy();
    expect(screen.getByText('2 kg × Wheat seeds')).toBeTruthy();
  });

  it('keeps delivery on its own line and says who is paid directly (BR-09, BR-11)', async () => {
    signIn('buyer-1', 'buyer');
    mockFetchOrderById.mockResolvedValue(order());
    await renderWithQuery(<OrderDetailScreen />);

    expect(await screen.findByLabelText('Products Rs 500')).toBeTruthy();
    expect(screen.getByLabelText('Delivery charge Rs 50')).toBeTruthy();
    expect(screen.getByLabelText('Total Rs 550')).toBeTruthy();
    expect(screen.getByText('You pay Green Farms directly. ZaraiLink does not hold your money.')).toBeTruthy();
  });

  it('tells the seller that the buyer pays them directly', async () => {
    signIn('seller-1', 'farmer');
    mockFetchOrderById.mockResolvedValue(order());
    await renderWithQuery(<OrderDetailScreen />);
    expect(await screen.findByText('Ali Khan pays you directly. ZaraiLink does not hold the money.')).toBeTruthy();
    expect(screen.getByText('Ali Khan is waiting for you to confirm this order.')).toBeTruthy();
  });

  it('shows the timeline once, and no second "Status History" list (MK-12)', async () => {
    signIn('buyer-1', 'buyer');
    mockFetchOrderById.mockResolvedValue(order());
    mockFetchOrderStatusHistory.mockResolvedValue([
      { id: 'h1', order_id: 'order-1', from_status: null, to_status: 'pending', changed_by: 'buyer-1', created_at: '2026-01-01T09:00:00.000Z' },
    ]);
    await renderWithQuery(<OrderDetailScreen />);
    expect(await screen.findByText('Progress')).toBeTruthy();
    expect(screen.queryByText('Status History')).toBeNull();
  });

  it('still opens an order whose status this build does not know yet', async () => {
    // An installed build meets API values before it is updated; the screen must not crash.
    signIn('buyer-1', 'buyer');
    mockFetchOrderById.mockResolvedValue(order({ status: 'on_hold' as never }));
    mockFetchOrderStatusHistory.mockResolvedValue([
      { id: 'h1', order_id: 'order-1', from_status: 'ready', to_status: 'on_hold' as never, changed_by: 'seller-1', created_at: '2026-01-02T00:00:00.000Z' },
    ]);
    await renderWithQuery(<OrderDetailScreen />);

    expect(await screen.findByText('This order is at a stage this version of the app does not know yet.')).toBeTruthy();
    expect(screen.getAllByText('On hold').length).toBeGreaterThan(0);
  });

  it('shows a Banner with "Try again" when the order cannot be loaded (MK-03)', async () => {
    signIn('buyer-1', 'buyer');
    mockFetchOrderById.mockRejectedValueOnce(new Error('Server down'));
    await renderWithQuery(<OrderDetailScreen />);
    expect(await screen.findByText("Couldn't load this order")).toBeTruthy();

    mockFetchOrderById.mockResolvedValue(order());
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Wheat seeds', { exact: false })).toBeTruthy();
  });

  describe('the buyer', () => {
    it('is offered "Choose how to pay" when no payment exists yet, and Cancel only as a quiet action', async () => {
      signIn('buyer-1', 'buyer');
      mockFetchOrderById.mockResolvedValue(order());
      await renderWithQuery(<OrderDetailScreen />);

      await fireEvent.press(await screen.findByRole('button', { name: 'Choose how to pay' }));
      expect(mockNavigate).toHaveBeenCalledWith(ORDERS_ROUTES.PaymentMethod, { orderId: 'order-1' });
      expect(screen.getByRole('button', { name: 'Cancel order' })).toBeTruthy();
    });

    it('shows the chosen method and its status, and no second way to pay, once a payment exists', async () => {
      signIn('buyer-1', 'buyer');
      mockFetchOrderById.mockResolvedValue(order({ status: 'confirmed' }));
      mockFetchPaymentByOrderId.mockResolvedValue(payment());
      await renderWithQuery(<OrderDetailScreen />);

      expect(await screen.findByText('Cash on delivery')).toBeTruthy();
      expect(screen.getByText('Awaiting payment')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Choose how to pay' })).toBeNull();
      expect(screen.queryByRole('button', { name: /Mark payment/ })).toBeNull();
    });

    it('cancels only after a sheet that names the consequence, and "Keep the order" cancels nothing', async () => {
      signIn('buyer-1', 'buyer');
      mockFetchOrderById.mockResolvedValue(order());
      await renderWithQuery(<OrderDetailScreen />);

      await fireEvent.press(await screen.findByRole('button', { name: 'Cancel order' }));
      expect(await screen.findByText('Cancel this order?')).toBeTruthy();
      expect(screen.getByText("Green Farms is told it was cancelled. This can't be undone.")).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', { name: 'Keep the order' }));
      expect(mockUpdateOrderStatus).not.toHaveBeenCalled();

      await fireEvent.press(screen.getByRole('button', { name: 'Cancel order' }));
      await fireEvent.press(sheetButton('Cancel order'));
      await waitFor(() => expect(mockUpdateOrderStatus).toHaveBeenCalledWith('order-1', 'cancelled'));
      expect(await screen.findByText('Order cancelled')).toBeTruthy();
    });

    it('offers no dispatch', async () => {
      signIn('buyer-1', 'buyer');
      mockFetchOrderById.mockResolvedValue(order({ status: 'ready' }));
      await renderWithQuery(<OrderDetailScreen />);
      await screen.findByText('Your order is ready. Green Farms dispatches it next.');
      expect(screen.queryByRole('button', { name: 'Dispatch order' })).toBeNull();
    });

    it('writes a review for a completed order with none yet, and disputes only through a sheet', async () => {
      signIn('buyer-1', 'buyer');
      mockFetchOrderById.mockResolvedValue(order({ status: 'completed' }));
      await renderWithQuery(<OrderDetailScreen />);

      await fireEvent.press(await screen.findByRole('button', { name: 'Write a review' }));
      expect(mockNavigate).toHaveBeenCalledWith(ORDERS_ROUTES.WriteReview, {
        orderId: 'order-1',
        listingId: 'listing-1',
        sellerId: 'seller-1',
      });

      await fireEvent.press(screen.getByRole('button', { name: 'Dispute order' }));
      expect(await screen.findByText('Dispute this order?')).toBeTruthy();
      expect(mockUpdateOrderStatus).not.toHaveBeenCalled();
      await fireEvent.press(screen.getByRole('button', { name: 'Open dispute' }));
      await waitFor(() => expect(mockUpdateOrderStatus).toHaveBeenCalledWith('order-1', 'disputed'));
    });

    it('opens a chat with the seller on top of the conversation list (MK-01)', async () => {
      signIn('buyer-1', 'buyer');
      mockFetchOrderById.mockResolvedValue(order());
      mockFindOrCreateConversation.mockResolvedValue({ id: 'conversation-1' });
      await renderWithQuery(<OrderDetailScreen />);

      await fireEvent.press(await screen.findByRole('button', { name: 'Message Green Farms, the seller' }));

      expect(mockFindOrCreateConversation).toHaveBeenCalledWith('seller-1');
      await waitFor(() =>
        expect(mockTabNavigate).toHaveBeenCalledWith(APP_TABS.Messages, {
          screen: MESSAGING_ROUTES.Chat,
          initial: false,
          params: { conversationId: 'conversation-1', otherUserName: 'Green Farms' },
        }),
      );
    });
  });

  describe('the seller', () => {
    it('has one primary action per status, in the bar: Confirm order for a pending order', async () => {
      signIn('seller-1', 'farmer');
      mockFetchOrderById.mockResolvedValue(order());
      await renderWithQuery(<OrderDetailScreen />);

      await fireEvent.press(await screen.findByRole('button', { name: 'Confirm order' }));

      await waitFor(() => expect(mockUpdateOrderStatus).toHaveBeenCalledWith('order-1', 'confirmed'));
      expect(await screen.findByText('Order confirmed')).toBeTruthy();
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('rejects a pending order only through a sheet, and is not also offered Cancel (MK-06)', async () => {
      signIn('seller-1', 'farmer');
      mockFetchOrderById.mockResolvedValue(order());
      await renderWithQuery(<OrderDetailScreen />);

      await fireEvent.press(await screen.findByRole('button', { name: 'Reject order' }));
      expect(screen.queryByRole('button', { name: 'Cancel order' })).toBeNull();
      expect(await screen.findByText('Reject this order?')).toBeTruthy();
      expect(screen.getByText("Ali Khan is told you rejected it. This can't be undone.")).toBeTruthy();
      expect(mockUpdateOrderStatus).not.toHaveBeenCalled();

      await fireEvent.press(sheetButton('Reject order'));
      await waitFor(() => expect(mockUpdateOrderStatus).toHaveBeenCalledWith('order-1', 'rejected'));
      expect(await screen.findByText('Order rejected')).toBeTruthy();
    });

    it('may cancel once the order is confirmed, through a sheet', async () => {
      signIn('seller-1', 'farmer');
      mockFetchOrderById.mockResolvedValue(order({ status: 'confirmed' }));
      await renderWithQuery(<OrderDetailScreen />);

      await fireEvent.press(await screen.findByRole('button', { name: 'Cancel order' }));
      expect(screen.queryByRole('button', { name: 'Reject order' })).toBeNull();
      await fireEvent.press(sheetButton('Cancel order'));
      await waitFor(() => expect(mockUpdateOrderStatus).toHaveBeenCalledWith('order-1', 'cancelled'));
    });

    it('asks before dispatching, tells a dealer the stock is reduced, and dispatches the ready order (D5)', async () => {
      signIn('seller-1', 'dealer');
      mockFetchOrderById.mockResolvedValue(order({ status: 'ready' }));
      await renderWithQuery(<OrderDetailScreen />);
      // Ready is dispatched, never completed straight away.
      await screen.findByText('Dispatch it. Your stock is reduced when you do.');
      expect(screen.queryByRole('button', { name: 'Complete order' })).toBeNull();

      await fireEvent.press(screen.getByRole('button', { name: 'Dispatch order' }));
      expect(await screen.findByText("Your stock is reduced now, and Ali Khan sees the order as dispatched. This can't be undone.")).toBeTruthy();
      expect(mockUpdateOrderStatus).not.toHaveBeenCalled();

      await fireEvent.press(sheetButton('Dispatch order'));
      await waitFor(() => expect(mockUpdateOrderStatus).toHaveBeenCalledWith('order-1', 'dispatched'));
    });

    it('does not mention inventory to a farmer, who has none', async () => {
      signIn('seller-1', 'farmer');
      mockFetchOrderById.mockResolvedValue(order({ status: 'ready' }));
      await renderWithQuery(<OrderDetailScreen />);
      await fireEvent.press(await screen.findByRole('button', { name: 'Dispatch order' }));
      expect(await screen.findByText("Ali Khan sees the order as dispatched. This can't be undone.")).toBeTruthy();
      expect(screen.queryByText(/stock/i)).toBeNull();
    });

    it('dispatches nothing when the seller says not yet', async () => {
      signIn('seller-1', 'farmer');
      mockFetchOrderById.mockResolvedValue(order({ status: 'ready' }));
      await renderWithQuery(<OrderDetailScreen />);

      await fireEvent.press(await screen.findByRole('button', { name: 'Dispatch order' }));
      await fireEvent.press(await screen.findByRole('button', { name: 'Not yet' }));

      expect(mockUpdateOrderStatus).not.toHaveBeenCalled();
    });

    it('shows the shortage message inside the sheet when a dispatch is refused (D6)', async () => {
      signIn('seller-1', 'dealer');
      mockFetchOrderById.mockResolvedValue(order({ status: 'ready' }));
      mockUpdateOrderStatus.mockRejectedValue(new Error('Not enough stock to dispatch this order, needs 3 but only 2 in stock.'));
      await renderWithQuery(<OrderDetailScreen />);

      await fireEvent.press(await screen.findByRole('button', { name: 'Dispatch order' }));
      await fireEvent.press(sheetButton('Dispatch order'));

      expect(await screen.findByText('Not enough stock to dispatch this order, needs 3 but only 2 in stock.')).toBeTruthy();
      // The sheet stays open on the failure, so the seller reads it and decides.
      expect(screen.getByText('Dispatch this order?')).toBeTruthy();
    });

    it('completes a dispatched order and offers no cancel', async () => {
      signIn('seller-1', 'farmer');
      mockFetchOrderById.mockResolvedValue(order({ status: 'dispatched' }));
      await renderWithQuery(<OrderDetailScreen />);
      await screen.findByText('Mark it completed once Ali Khan has the goods.');
      expect(screen.queryByRole('button', { name: 'Cancel order' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Dispatch order' })).toBeNull();

      await fireEvent.press(screen.getByRole('button', { name: 'Complete order' }));

      await waitFor(() => expect(mockUpdateOrderStatus).toHaveBeenCalledWith('order-1', 'completed'));
    });

    it('shows a Banner with the reason when a direct status change fails', async () => {
      signIn('seller-1', 'farmer');
      mockFetchOrderById.mockResolvedValue(order());
      mockUpdateOrderStatus.mockRejectedValue(new Error('Order already updated'));
      await renderWithQuery(<OrderDetailScreen />);

      await fireEvent.press(await screen.findByRole('button', { name: 'Confirm order' }));

      expect(await screen.findByText('That did not go through')).toBeTruthy();
      expect(screen.getByText('Order already updated')).toBeTruthy();
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('marks a pending payment as received only after a sheet that says who paid whom', async () => {
      signIn('seller-1', 'farmer');
      mockFetchOrderById.mockResolvedValue(order({ status: 'dispatched' }));
      mockFetchPaymentByOrderId.mockResolvedValue(payment());
      await renderWithQuery(<OrderDetailScreen />);

      await fireEvent.press(await screen.findByRole('button', { name: 'Mark payment as received' }));
      expect(await screen.findByText('Mark payment as received?')).toBeTruthy();
      expect(screen.getByText('Confirm that Ali Khan paid you Rs 550. They paid you directly; ZaraiLink holds no money.')).toBeTruthy();
      expect(mockMarkPaymentReceived).not.toHaveBeenCalled();

      await fireEvent.press(screen.getByRole('button', { name: 'Mark as paid' }));
      await waitFor(() => expect(mockMarkPaymentReceived).toHaveBeenCalledWith('payment-1'));
      expect(await screen.findByText('Payment marked as received')).toBeTruthy();
    });

    it('marks a payment as not received with an optional reason the payments API accepts', async () => {
      signIn('seller-1', 'farmer');
      mockFetchOrderById.mockResolvedValue(order({ status: 'confirmed' }));
      mockFetchPaymentByOrderId.mockResolvedValue(payment());
      await renderWithQuery(<OrderDetailScreen />);

      await fireEvent.press(await screen.findByRole('button', { name: 'Payment not received' }));
      expect(await screen.findByText('Mark payment as not received?')).toBeTruthy();
      await fireEvent.changeText(screen.getByLabelText('Reason'), 'Cash was not handed over');
      await fireEvent.press(screen.getByRole('button', { name: 'Mark as not received' }));

      await waitFor(() => expect(mockMarkPaymentFailed).toHaveBeenCalledWith('payment-1', 'Cash was not handed over'));
    });

    it('sends no reason when none was typed', async () => {
      signIn('seller-1', 'farmer');
      mockFetchOrderById.mockResolvedValue(order({ status: 'confirmed' }));
      mockFetchPaymentByOrderId.mockResolvedValue(payment());
      await renderWithQuery(<OrderDetailScreen />);

      await fireEvent.press(await screen.findByRole('button', { name: 'Payment not received' }));
      await fireEvent.press(await screen.findByRole('button', { name: 'Mark as not received' }));
      await waitFor(() => expect(mockMarkPaymentFailed).toHaveBeenCalledWith('payment-1', null));
    });
  });

  it('shows an administrator both sides and no actions', async () => {
    signIn('admin-1', 'admin');
    mockFetchOrderById.mockResolvedValue(order());
    await renderWithQuery(<OrderDetailScreen />);

    expect(await screen.findByText('Ali Khan')).toBeTruthy();
    expect(screen.getByText('Green Farms')).toBeTruthy();
    expect(screen.getByText('Green Farms has not confirmed yet.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Confirm order|Reject order|Cancel order|Choose how to pay/ })).toBeNull();
  });
});
