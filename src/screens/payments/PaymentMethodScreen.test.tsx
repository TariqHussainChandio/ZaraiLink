import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import '../../localization';
import { PaymentMethodScreen } from './PaymentMethodScreen';
import { fetchOrderById } from '../../services/modules/orders/ordersService';
import { fetchPaymentByOrderId, initiatePayment } from '../../services/modules/payments/paymentsService';
import { useAuthStore } from '../../store/authStore';
import { ORDERS_ROUTES } from '../../constants/routes';
import type { OrdersScreenProps } from '../../navigation/stacks/OrdersNavigator';

jest.mock('../../services/modules/orders/ordersService', () => ({
  fetchOrderById: jest.fn(),
}));
jest.mock('../../services/modules/payments/paymentsService', () => ({
  fetchPaymentByOrderId: jest.fn(),
  initiatePayment: jest.fn(),
}));

const mockFetchOrder = fetchOrderById as jest.Mock;
const mockFetchPayment = fetchPaymentByOrderId as jest.Mock;
const mockInitiate = initiatePayment as jest.Mock;

function makeProps() {
  return {
    navigation: { replace: jest.fn() },
    route: { params: { orderId: 'order-1' } },
  } as unknown as OrdersScreenProps<'PaymentMethod'>;
}

beforeEach(() => {
  mockFetchOrder.mockReset();
  mockFetchPayment.mockReset();
  mockInitiate.mockReset();
  useAuthStore.setState({ user: { id: 'user-1' } as never });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('PaymentMethodScreen', () => {
  it('loads the order total and defaults to Cash on Delivery', async () => {
    mockFetchOrder.mockResolvedValue({ total: 1500 });
    mockFetchPayment.mockResolvedValue(null);
    await render(<PaymentMethodScreen {...makeProps()} />);

    expect(await screen.findByText('Rs. 1500')).toBeTruthy();
    expect(screen.getByText('Cash on Delivery')).toBeTruthy();
    expect(screen.getByText('Bank Transfer')).toBeTruthy();
  });

  it('redirects straight to PaymentProcessing when a payment already exists', async () => {
    mockFetchOrder.mockResolvedValue({ total: 1500 });
    mockFetchPayment.mockResolvedValue({ id: 'payment-1' });
    const props = makeProps();
    await render(<PaymentMethodScreen {...props} />);

    await waitFor(() =>
      expect(props.navigation.replace).toHaveBeenCalledWith(ORDERS_ROUTES.PaymentProcessing, {
        paymentId: 'payment-1',
      }),
    );
  });

  it('initiates payment with the selected method and moves to PaymentProcessing', async () => {
    mockFetchOrder.mockResolvedValue({ total: 1500 });
    mockFetchPayment.mockResolvedValue(null);
    mockInitiate.mockResolvedValue({ id: 'payment-2' });
    const props = makeProps();
    await render(<PaymentMethodScreen {...props} />);
    await screen.findByText('Rs. 1500');

    await fireEvent.press(screen.getByText('Bank Transfer'));
    await fireEvent.press(screen.getByText('Continue'));

    expect(mockInitiate).toHaveBeenCalledWith('order-1', 'bank_transfer');
    expect(props.navigation.replace).toHaveBeenCalledWith(ORDERS_ROUTES.PaymentProcessing, {
      paymentId: 'payment-2',
    });
  });

  it('shows an alert when initiatePayment fails', async () => {
    mockFetchOrder.mockResolvedValue({ total: 1500 });
    mockFetchPayment.mockResolvedValue(null);
    mockInitiate.mockRejectedValue(new Error('Gateway unavailable'));
    await render(<PaymentMethodScreen {...makeProps()} />);
    await screen.findByText('Rs. 1500');

    await fireEvent.press(screen.getByText('Continue'));

    expect(Alert.alert).toHaveBeenCalledWith('Could not start payment', 'Gateway unavailable');
  });
});
