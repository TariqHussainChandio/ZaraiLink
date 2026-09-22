import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import '../../localization';
import { PaymentResultScreen } from './PaymentResultScreen';
import { fetchPaymentById } from '../../services/modules/payments/paymentsService';
import { ORDERS_ROUTES } from '../../constants/routes';
import type { OrdersScreenProps } from '../../navigation/stacks/OrdersNavigator';

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

jest.mock('../../services/modules/payments/paymentsService', () => ({
  fetchPaymentById: jest.fn(),
}));

const mockFetchPayment = fetchPaymentById as jest.Mock;

function makeProps() {
  return {
    navigation: { reset: jest.fn() },
    route: { params: { paymentId: 'payment-1' } },
  } as unknown as OrdersScreenProps<'PaymentResult'>;
}

beforeEach(() => {
  mockFetchPayment.mockReset();
});

describe('PaymentResultScreen', () => {
  it('shows the confirmed result for a successful payment', async () => {
    mockFetchPayment.mockResolvedValue({
      id: 'payment-1',
      order_id: 'order-1',
      amount: 1500,
      method: 'cod',
      status: 'successful',
    });
    await render(<PaymentResultScreen {...makeProps()} />);

    expect(await screen.findByText('Payment Confirmed')).toBeTruthy();
    expect(screen.getByText('Rs. 1500')).toBeTruthy();
  });

  it('shows the failed copy for a failed payment', async () => {
    mockFetchPayment.mockResolvedValue({
      id: 'payment-1',
      order_id: 'order-1',
      amount: 1500,
      method: 'cod',
      status: 'failed',
    });
    await render(<PaymentResultScreen {...makeProps()} />);
    expect(await screen.findByText('Payment Failed')).toBeTruthy();
  });

  it('shows a retryable error state when loading fails', async () => {
    mockFetchPayment.mockRejectedValue(new Error('network down'));
    await render(<PaymentResultScreen {...makeProps()} />);

    expect(await screen.findByText("Couldn't load payment result")).toBeTruthy();

    mockFetchPayment.mockResolvedValue({
      id: 'payment-1',
      order_id: 'order-1',
      amount: 1500,
      method: 'cod',
      status: 'successful',
    });
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('Payment Confirmed')).toBeTruthy();
  });

  it('navigates back to the order', async () => {
    mockFetchPayment.mockResolvedValue({
      id: 'payment-1',
      order_id: 'order-1',
      amount: 1500,
      method: 'cod',
      status: 'successful',
    });
    const props = makeProps();
    await render(<PaymentResultScreen {...props} />);
    await screen.findByText('Payment Confirmed');

    await fireEvent.press(screen.getByText('Back to Order'));
    expect(props.navigation.reset).toHaveBeenCalledWith({
      index: 1,
      routes: [
        { name: ORDERS_ROUTES.OrderHistory },
        { name: ORDERS_ROUTES.OrderDetail, params: { orderId: 'order-1' } },
      ],
    });
  });
});
