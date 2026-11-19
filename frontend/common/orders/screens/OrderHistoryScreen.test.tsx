import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { OrderHistoryScreen } from './OrderHistoryScreen';
import { fetchOrdersForUser } from '../services/ordersService';
import { useAuthStore } from '../../../state/authStore';
import { renderWithProviders } from '../../../testUtils/renderWithProviders';
import { ORDERS_ROUTES } from '../../constants/routes';
import type { OrderWithItems } from '../types/orders';
import type { OrdersScreenProps } from '../../../navigation/stacks/OrdersNavigator';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const { useEffect } = jest.requireActual('react');
  return {
    ...actual,
    useFocusEffect: (effect: () => void) =>
      useEffect(() => {
        effect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []),
  };
});

jest.mock('../services/ordersService', () => ({
  fetchOrdersForUser: jest.fn(),
}));

const mockFetchOrdersForUser = fetchOrdersForUser as jest.Mock;

const order = (overrides: Partial<OrderWithItems> = {}): OrderWithItems =>
  ({
    id: 'order-1',
    buyer_id: 'buyer-1',
    seller_id: 'seller-1',
    status: 'pending',
    product_subtotal: 500,
    delivery_charge: 0,
    total: 500,
    created_at: '2026-01-01T12:00:00.000Z',
    updated_at: '2026-01-01T12:00:00.000Z',
    order_items: [
      { id: 'item-1', order_id: 'order-1', listing_id: 'listing-1', quantity: 2, unit_price: 250, created_at: '2026-01-01T12:00:00.000Z', listing: { title: 'Wheat seeds', unit: 'kg' } },
    ],
    buyer: { id: 'buyer-1', full_name: 'Ali Khan' },
    seller: { id: 'seller-1', full_name: 'Green Farms' },
    ...overrides,
  }) as OrderWithItems;

function props(navigation = { navigate: jest.fn() }) {
  return { navigation, props: { navigation, route: {} } as unknown as OrdersScreenProps<'OrderHistory'> };
}

beforeEach(() => {
  mockFetchOrdersForUser.mockReset();
  mockFetchOrdersForUser.mockResolvedValue([]);
  useAuthStore.setState({ user: { id: 'buyer-1' } as never, role: 'buyer' as never });
});

describe('OrderHistoryScreen', () => {
  it('lists a buyer\'s open orders, with what was bought, and offers no Sales choice (MK-20)', async () => {
    mockFetchOrdersForUser.mockResolvedValue([order()]);
    await renderWithProviders(<OrderHistoryScreen {...props().props} />);

    expect(await screen.findByText('Green Farms')).toBeTruthy();
    expect(screen.getByText(/^2 × Wheat seeds/)).toBeTruthy();
    expect(mockFetchOrdersForUser).toHaveBeenCalledWith('buyer');
    expect(screen.queryByText('Sales')).toBeNull();
    expect(screen.queryByText('Purchases')).toBeNull();
  });

  it('starts a farmer on Sales and lets them switch to Purchases, refetching for the other side', async () => {
    useAuthStore.setState({ user: { id: 'seller-1' } as never, role: 'farmer' as never });
    mockFetchOrdersForUser.mockResolvedValue([order()]);
    await renderWithProviders(<OrderHistoryScreen {...props().props} />);

    expect(await screen.findByText('Ali Khan')).toBeTruthy();
    expect(mockFetchOrdersForUser).toHaveBeenCalledWith('seller');

    mockFetchOrdersForUser.mockClear();
    await fireEvent.press(screen.getByText('Purchases'));
    expect(await screen.findByText('Green Farms')).toBeTruthy();
    expect(mockFetchOrdersForUser).toHaveBeenCalledWith('buyer');
  });

  it('separates open orders from completed and cancelled ones', async () => {
    mockFetchOrdersForUser.mockResolvedValue([
      order({ id: 'o-open', status: 'dispatched', seller: { id: 's', full_name: 'Open Seller' } }),
      order({ id: 'o-done', status: 'completed', seller: { id: 's', full_name: 'Done Seller' } }),
      order({ id: 'o-gone', status: 'rejected', seller: { id: 's', full_name: 'Gone Seller' } }),
    ]);
    await renderWithProviders(<OrderHistoryScreen {...props().props} />);

    expect(await screen.findByText('Open Seller')).toBeTruthy();
    expect(screen.queryByText('Done Seller')).toBeNull();
    expect(screen.queryByText('Gone Seller')).toBeNull();

    await fireEvent.press(screen.getByText('Completed'));
    expect(screen.getByText('Done Seller')).toBeTruthy();
    expect(screen.queryByText('Open Seller')).toBeNull();

    await fireEvent.press(screen.getByText('Cancelled'));
    expect(screen.getByText('Gone Seller')).toBeTruthy();
  });

  it('tells a buyer with no open orders where to find something (MK-14)', async () => {
    await renderWithProviders(<OrderHistoryScreen {...props().props} />);
    expect(await screen.findByText('No open orders')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Browse the market' })).toBeTruthy();
  });

  it('says "No open sales" to a seller, with no shopping button', async () => {
    useAuthStore.setState({ user: { id: 'seller-1' } as never, role: 'dealer' as never });
    await renderWithProviders(<OrderHistoryScreen {...props().props} />);
    expect(await screen.findByText('No open sales')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Browse the market' })).toBeNull();
  });

  it('shows a Banner with "Try again" when the load fails, never "No purchases yet" (MK-03)', async () => {
    mockFetchOrdersForUser.mockRejectedValueOnce(new Error('Server down'));
    await renderWithProviders(<OrderHistoryScreen {...props().props} />);

    expect(await screen.findByText("Couldn't load your orders")).toBeTruthy();
    expect(screen.queryByText('No open orders')).toBeNull();

    mockFetchOrdersForUser.mockResolvedValue([order()]);
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Green Farms')).toBeTruthy();
  });

  it('navigates to OrderDetail when an order is pressed', async () => {
    mockFetchOrdersForUser.mockResolvedValue([order({ id: 'order-99' })]);
    const { navigation, props: screenProps } = props();
    await renderWithProviders(<OrderHistoryScreen {...screenProps} />);

    await fireEvent.press(await screen.findByText('Green Farms'));
    expect(navigation.navigate).toHaveBeenCalledWith(ORDERS_ROUTES.OrderDetail, { orderId: 'order-99' });
  });
});
