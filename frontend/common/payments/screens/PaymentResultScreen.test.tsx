import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { PaymentResultScreen } from './PaymentResultScreen';
import { fetchOrderById } from '../../orders/services/ordersService';
import { fetchPaymentById, fetchPaymentByOrderId } from '../services/paymentsService';
import { ORDERS_ROUTES } from '../../constants/routes';
import type { OrdersScreenProps } from '../../../navigation/stacks/OrdersNavigator';

jest.mock('../../orders/services/ordersService', () => ({
  fetchOrderById: jest.fn(),
}));
jest.mock('../services/paymentsService', () => ({
  fetchPaymentById: jest.fn(),
  fetchPaymentByOrderId: jest.fn(),
}));

const mockFetchPayment = fetchPaymentById as jest.Mock;

const payment = (status: string) => ({ id: 'payment-1', order_id: 'order-1', amount: 1550, method: 'cod', status });

function makeProps() {
  return {
    navigation: { reset: jest.fn() },
    route: { params: { paymentId: 'payment-1' } },
  } as unknown as OrdersScreenProps<'PaymentResult'>;
}

beforeEach(() => {
  mockFetchPayment.mockReset();
  (fetchOrderById as jest.Mock).mockReset().mockResolvedValue({
    total: 1550,
    product_subtotal: 1500,
    delivery_charge: 50,
    seller: { id: 'seller-1', full_name: 'Green Farms' },
  });
  (fetchPaymentByOrderId as jest.Mock).mockReset().mockResolvedValue(null);
});

describe('PaymentResultScreen', () => {
  it('shows the confirmed result for a successful payment, with the delivery line', async () => {
    mockFetchPayment.mockResolvedValue(payment('successful'));
    await renderWithQuery(<PaymentResultScreen {...makeProps()} />);

    expect(await screen.findByText('Payment confirmed')).toBeTruthy();
    expect(await screen.findByLabelText('Delivery charge Rs 50')).toBeTruthy();
    expect(screen.getByLabelText('Total Rs 1,550')).toBeTruthy();
  });

  it('says a failed payment was not received, and what to do next', async () => {
    mockFetchPayment.mockResolvedValue(payment('failed'));
    await renderWithQuery(<PaymentResultScreen {...makeProps()} />);
    expect(await screen.findByText('Payment not received')).toBeTruthy();
    expect(screen.getByText(/Message the seller from the order/)).toBeTruthy();
  });

  it('says the seller returned the money directly after a refund (BR-11)', async () => {
    mockFetchPayment.mockResolvedValue(payment('refunded'));
    await renderWithQuery(<PaymentResultScreen {...makeProps()} />);
    expect(await screen.findByText('The seller returned this money to you directly. ZaraiLink never held it.')).toBeTruthy();
  });

  it('reads a status this build does not know as its word instead of crashing', async () => {
    mockFetchPayment.mockResolvedValue(payment('partially_refunded'));
    await renderWithQuery(<PaymentResultScreen {...makeProps()} />);
    expect(await screen.findByText('This payment has been updated.')).toBeTruthy();
    // The badge and the title both read the vocabulary's fallback word.
    expect(screen.getAllByText('Partially refunded')).toHaveLength(2);
  });

  it('shows a Banner with "Try again" when loading fails, and recovers', async () => {
    mockFetchPayment.mockRejectedValueOnce(new Error('network down'));
    await renderWithQuery(<PaymentResultScreen {...makeProps()} />);

    expect(await screen.findByText("Couldn't load the payment")).toBeTruthy();

    mockFetchPayment.mockResolvedValue(payment('successful'));
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Payment confirmed')).toBeTruthy();
  });

  it('navigates back to the order', async () => {
    mockFetchPayment.mockResolvedValue(payment('successful'));
    const props = makeProps();
    await renderWithQuery(<PaymentResultScreen {...props} />);
    await screen.findByText('Payment confirmed');

    await fireEvent.press(screen.getByRole('button', { name: 'Back to order' }));
    expect(props.navigation.reset).toHaveBeenCalledWith({
      index: 1,
      routes: [{ name: ORDERS_ROUTES.OrderHistory }, { name: ORDERS_ROUTES.OrderDetail, params: { orderId: 'order-1' } }],
    });
  });
});
