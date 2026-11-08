import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { PaymentProcessingScreen } from './PaymentProcessingScreen';
import { fetchOrderById } from '../../orders/services/ordersService';
import { fetchPaymentById, fetchPaymentByOrderId } from '../services/paymentsService';
import { ORDERS_ROUTES } from '../../constants/routes';
import type { OrdersScreenProps } from '../../../navigation/stacks/OrdersNavigator';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const { useEffect } = jest.requireActual('react');
  return {
    ...actual,
    // Runs once on mount instead of react-navigation's real focus/blur lifecycle — sufficient
    // for testing a screen's initial data load without a NavigationContainer.
    useFocusEffect: (effect: () => void) =>
      useEffect(() => {
        effect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []),
  };
});

jest.mock('../../orders/services/ordersService', () => ({
  fetchOrderById: jest.fn(),
}));
jest.mock('../services/paymentsService', () => ({
  fetchPaymentById: jest.fn(),
  fetchPaymentByOrderId: jest.fn(),
}));

const mockFetchPayment = fetchPaymentById as jest.Mock;
const mockFetchOrder = fetchOrderById as jest.Mock;
const mockFetchPaymentByOrder = fetchPaymentByOrderId as jest.Mock;

const pending = { id: 'payment-1', order_id: 'order-1', amount: 1550, method: 'cod', status: 'pending' };

function makeProps() {
  return {
    navigation: { replace: jest.fn(), reset: jest.fn() },
    route: { params: { paymentId: 'payment-1' } },
  } as unknown as OrdersScreenProps<'PaymentProcessing'>;
}

beforeEach(() => {
  mockFetchPayment.mockReset();
  mockFetchOrder.mockReset().mockResolvedValue({
    total: 1550,
    product_subtotal: 1500,
    delivery_charge: 50,
    seller: { id: 'seller-1', full_name: 'Green Farms' },
  });
  mockFetchPaymentByOrder.mockReset().mockResolvedValue(pending);
});

describe('PaymentProcessingScreen', () => {
  it('shows the method, its status, the delivery line (BR-09) and who is paid (BR-11)', async () => {
    mockFetchPayment.mockResolvedValue(pending);
    await renderWithQuery(<PaymentProcessingScreen {...makeProps()} />);

    expect(await screen.findByText('Cash on delivery')).toBeTruthy();
    expect(screen.getByText('Awaiting payment')).toBeTruthy();
    expect(await screen.findByLabelText('Delivery charge Rs 50')).toBeTruthy();
    expect(screen.getByLabelText('Total Rs 1,550')).toBeTruthy();
    expect(screen.getByText('You pay Green Farms directly. ZaraiLink does not hold your money.')).toBeTruthy();
  });

  it('says what happens next for cash on delivery, not that it waits for money (BR-11)', async () => {
    mockFetchPayment.mockResolvedValue(pending);
    await renderWithQuery(<PaymentProcessingScreen {...makeProps()} />);
    expect(await screen.findByText(/Pay the seller in cash when you receive the goods/)).toBeTruthy();
    expect(screen.queryByText(/Waiting for the seller to confirm payment receipt/)).toBeNull();
  });

  it('redirects to PaymentResult once the status becomes terminal', async () => {
    mockFetchPayment.mockResolvedValue({ ...pending, status: 'successful' });
    const props = makeProps();
    await renderWithQuery(<PaymentProcessingScreen {...props} />);

    await waitFor(() =>
      expect(props.navigation.replace).toHaveBeenCalledWith(ORDERS_ROUTES.PaymentResult, {
        paymentId: 'payment-1',
      }),
    );
  });

  it('re-checks the status on demand', async () => {
    mockFetchPayment.mockResolvedValue(pending);
    await renderWithQuery(<PaymentProcessingScreen {...makeProps()} />);
    await screen.findByText('Cash on delivery');

    await fireEvent.press(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(mockFetchPayment).toHaveBeenCalledTimes(2));
  });

  it('navigates back to the order', async () => {
    mockFetchPayment.mockResolvedValue(pending);
    const props = makeProps();
    await renderWithQuery(<PaymentProcessingScreen {...props} />);
    await screen.findByText('Cash on delivery');

    await fireEvent.press(screen.getByRole('button', { name: 'Back to order' }));
    expect(props.navigation.reset).toHaveBeenCalledWith({
      index: 1,
      routes: [{ name: ORDERS_ROUTES.OrderHistory }, { name: ORDERS_ROUTES.OrderDetail, params: { orderId: 'order-1' } }],
    });
  });

  it('shows a Banner with "Try again" instead of spinning forever when the payment cannot be loaded (MK-03)', async () => {
    mockFetchPayment.mockRejectedValueOnce(new Error('Server down'));
    await renderWithQuery(<PaymentProcessingScreen {...makeProps()} />);
    expect(await screen.findByText("Couldn't load this payment")).toBeTruthy();

    mockFetchPayment.mockResolvedValue(pending);
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Cash on delivery')).toBeTruthy();
  });
});
