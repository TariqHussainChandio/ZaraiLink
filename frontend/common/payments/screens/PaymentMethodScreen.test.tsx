import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { PaymentMethodScreen } from './PaymentMethodScreen';
import { fetchOrderById } from '../../orders/services/ordersService';
import { fetchPaymentByOrderId, initiatePayment } from '../services/paymentsService';
import { useAuthStore } from '../../../state/authStore';
import { ORDERS_ROUTES } from '../../constants/routes';
import type { OrdersScreenProps } from '../../../navigation/stacks/OrdersNavigator';

jest.mock('../../orders/services/ordersService', () => ({
  fetchOrderById: jest.fn(),
}));
jest.mock('../services/paymentsService', () => ({
  fetchPaymentByOrderId: jest.fn(),
  initiatePayment: jest.fn(),
}));

const mockFetchOrder = fetchOrderById as jest.Mock;
const mockFetchPayment = fetchPaymentByOrderId as jest.Mock;
const mockInitiate = initiatePayment as jest.Mock;

const order = { total: 1550, product_subtotal: 1500, delivery_charge: 50, seller: { id: 'seller-1', full_name: 'Green Farms' } };

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
});

describe('PaymentMethodScreen', () => {
  it('shows products and delivery on their own lines, and who is paid (BR-09, BR-11)', async () => {
    mockFetchOrder.mockResolvedValue(order);
    mockFetchPayment.mockResolvedValue(null);
    await renderWithQuery(<PaymentMethodScreen {...makeProps()} />);

    expect(await screen.findByLabelText('Products Rs 1,500')).toBeTruthy();
    expect(screen.getByLabelText('Delivery charge Rs 50')).toBeTruthy();
    expect(screen.getByLabelText('Total Rs 1,550')).toBeTruthy();
    expect(screen.getByText('You pay Green Farms directly. ZaraiLink does not hold your money.')).toBeTruthy();
  });

  it('offers Cash on delivery as chosen and Bank transfer disabled with its reason', async () => {
    mockFetchOrder.mockResolvedValue(order);
    mockFetchPayment.mockResolvedValue(null);
    await renderWithQuery(<PaymentMethodScreen {...makeProps()} />);

    const cash = await screen.findByRole('radio', { name: /^Cash on delivery/ });
    expect(cash.props.accessibilityState).toMatchObject({ checked: true });
    const bank = screen.getByRole('radio', { name: /^Bank transfer/ });
    expect(bank.props.accessibilityState).toMatchObject({ checked: false, disabled: true });
    expect(screen.getByText('Not offered by this seller yet')).toBeTruthy();
  });

  it('redirects straight to PaymentProcessing when a payment already exists', async () => {
    mockFetchOrder.mockResolvedValue(order);
    mockFetchPayment.mockResolvedValue({ id: 'payment-1' });
    const props = makeProps();
    await renderWithQuery(<PaymentMethodScreen {...props} />);

    await waitFor(() =>
      expect(props.navigation.replace).toHaveBeenCalledWith(ORDERS_ROUTES.PaymentProcessing, {
        paymentId: 'payment-1',
      }),
    );
  });

  it('starts the payment with cash on delivery and moves to PaymentProcessing', async () => {
    mockFetchOrder.mockResolvedValue(order);
    mockFetchPayment.mockResolvedValue(null);
    mockInitiate.mockResolvedValue({ id: 'payment-2' });
    const props = makeProps();
    await renderWithQuery(<PaymentMethodScreen {...props} />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Confirm cash on delivery' }));

    await waitFor(() => expect(mockInitiate).toHaveBeenCalledWith('order-1', 'cod'));
    expect(props.navigation.replace).toHaveBeenCalledWith(ORDERS_ROUTES.PaymentProcessing, { paymentId: 'payment-2' });
  });

  it('cannot start a bank transfer: the disabled option does nothing when pressed', async () => {
    mockFetchOrder.mockResolvedValue(order);
    mockFetchPayment.mockResolvedValue(null);
    await renderWithQuery(<PaymentMethodScreen {...makeProps()} />);
    await fireEvent.press(await screen.findByRole('radio', { name: /^Bank transfer/ }));
    expect(screen.getByRole('radio', { name: /^Cash on delivery/ }).props.accessibilityState).toMatchObject({ checked: true });
  });

  it('shows a Banner, not an alert, when the payment cannot be started', async () => {
    mockFetchOrder.mockResolvedValue(order);
    mockFetchPayment.mockResolvedValue(null);
    mockInitiate.mockRejectedValue(new Error('Gateway unavailable'));
    const props = makeProps();
    await renderWithQuery(<PaymentMethodScreen {...props} />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Confirm cash on delivery' }));

    expect(await screen.findByText("Couldn't start the payment")).toBeTruthy();
    expect(screen.getByText('Gateway unavailable')).toBeTruthy();
    expect(props.navigation.replace).not.toHaveBeenCalled();
  });

  it('shows a Banner with "Try again" instead of spinning forever when the order cannot be loaded (MK-03)', async () => {
    mockFetchOrder.mockRejectedValueOnce(new Error('Server down'));
    mockFetchPayment.mockResolvedValue(null);
    await renderWithQuery(<PaymentMethodScreen {...makeProps()} />);
    expect(await screen.findByText("Couldn't load this order")).toBeTruthy();

    mockFetchOrder.mockResolvedValue(order);
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText('Total Rs 1,550')).toBeTruthy();
  });
});
