import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import '../../localization';
import { PaymentProcessingScreen } from './PaymentProcessingScreen';
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
    navigation: { replace: jest.fn(), reset: jest.fn() },
    route: { params: { paymentId: 'payment-1' } },
  } as unknown as OrdersScreenProps<'PaymentProcessing'>;
}

beforeEach(() => {
  mockFetchPayment.mockReset();
});

describe('PaymentProcessingScreen', () => {
  it('shows the pending payment amount and method', async () => {
    mockFetchPayment.mockResolvedValue({
      id: 'payment-1',
      order_id: 'order-1',
      amount: 1500,
      method: 'cod',
      status: 'pending',
    });
    await render(<PaymentProcessingScreen {...makeProps()} />);

    expect(await screen.findByText('Rs. 1500')).toBeTruthy();
    expect(screen.getByText('Cash on Delivery')).toBeTruthy();
  });

  it('redirects to PaymentResult once the status becomes terminal', async () => {
    mockFetchPayment.mockResolvedValue({
      id: 'payment-1',
      order_id: 'order-1',
      amount: 1500,
      method: 'cod',
      status: 'successful',
    });
    const props = makeProps();
    await render(<PaymentProcessingScreen {...props} />);

    await waitFor(() =>
      expect(props.navigation.replace).toHaveBeenCalledWith(ORDERS_ROUTES.PaymentResult, {
        paymentId: 'payment-1',
      }),
    );
  });

  it('re-checks the status on demand', async () => {
    mockFetchPayment.mockResolvedValue({
      id: 'payment-1',
      order_id: 'order-1',
      amount: 1500,
      method: 'bank_transfer',
      status: 'pending',
    });
    await render(<PaymentProcessingScreen {...makeProps()} />);
    await screen.findByText('Rs. 1500');

    await fireEvent.press(screen.getByText('Check Status'));
    expect(mockFetchPayment).toHaveBeenCalledTimes(2);
  });

  it('navigates back to the order', async () => {
    mockFetchPayment.mockResolvedValue({
      id: 'payment-1',
      order_id: 'order-1',
      amount: 1500,
      method: 'cod',
      status: 'pending',
    });
    const props = makeProps();
    await render(<PaymentProcessingScreen {...props} />);
    await screen.findByText('Rs. 1500');

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
