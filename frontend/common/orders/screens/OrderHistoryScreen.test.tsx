import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { OrderHistoryScreen } from './OrderHistoryScreen';
import { fetchOrdersForUser } from '../../services/modules/orders/ordersService';
import { useAuthStore } from '../../store/authStore';
import { createTestQueryClient } from '../../testUtils/renderWithProviders';
import { ORDERS_ROUTES } from '../../constants/routes';
import type { OrderWithItems } from '../../types/orders';
import type { OrdersScreenProps } from '../../navigation/stacks/OrdersNavigator';

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

jest.mock('../../services/modules/orders/ordersService', () => ({
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
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    order_items: [
      { id: 'item-1', order_id: 'order-1', listing_id: 'listing-1', quantity: 2, unit_price: 250, created_at: '2026-01-01T00:00:00.000Z', listing: { title: 'Wheat seeds', unit: 'kg' } },
    ],
    buyer: { id: 'buyer-1', full_name: 'Ali Khan' },
    seller: { id: 'seller-1', full_name: 'Green Farms' },
    ...overrides,
  }) as OrderWithItems;

function renderScreen(navigation = { navigate: jest.fn() }) {
  const queryClient = createTestQueryClient();
  const props = { navigation, route: {} } as unknown as OrdersScreenProps<'OrderHistory'>;
  return {
    navigation,
    render: () =>
      render(
        <QueryClientProvider client={queryClient}>
          <OrderHistoryScreen {...props} />
        </QueryClientProvider>,
      ),
  };
}

beforeEach(() => {
  mockFetchOrdersForUser.mockReset();
  mockFetchOrdersForUser.mockResolvedValue([]);
  useAuthStore.setState({ user: { id: 'buyer-1' } as never, role: 'buyer' as never });
});

describe('OrderHistoryScreen', () => {
  it('defaults to the Purchases segment for a buyer and lists orders', async () => {
    mockFetchOrdersForUser.mockResolvedValue([order()]);
    const { render: doRender } = renderScreen();
    await doRender();

    expect(await screen.findByText('Green Farms')).toBeTruthy();
    expect(mockFetchOrdersForUser).toHaveBeenCalledWith('buyer');
  });

  it('defaults to the Sales segment for a farmer', async () => {
    useAuthStore.setState({ user: { id: 'seller-1' } as never, role: 'farmer' as never });
    mockFetchOrdersForUser.mockResolvedValue([]);
    const { render: doRender } = renderScreen();
    await doRender();

    expect(await screen.findByText('No sales yet')).toBeTruthy();
    expect(mockFetchOrdersForUser).toHaveBeenCalledWith('seller');
  });

  it('switches segments and refetches for the other side', async () => {
    mockFetchOrdersForUser.mockResolvedValue([]);
    const { render: doRender } = renderScreen();
    await doRender();
    await screen.findByText('No purchases yet');

    mockFetchOrdersForUser.mockClear();
    mockFetchOrdersForUser.mockResolvedValue([order()]);
    await fireEvent.press(screen.getByText('Sales'));

    expect(await screen.findByText('Ali Khan')).toBeTruthy();
    expect(mockFetchOrdersForUser).toHaveBeenCalledWith('seller');
  });

  it('shows an empty state with no orders', async () => {
    mockFetchOrdersForUser.mockResolvedValue([]);
    const { render: doRender } = renderScreen();
    await doRender();
    expect(await screen.findByText('No purchases yet')).toBeTruthy();
  });

  it('navigates to OrderDetail when an order card is pressed', async () => {
    mockFetchOrdersForUser.mockResolvedValue([order({ id: 'order-99' })]);
    const { navigation, render: doRender } = renderScreen();
    await doRender();

    await fireEvent.press(await screen.findByText('Green Farms'));
    expect(navigation.navigate).toHaveBeenCalledWith(ORDERS_ROUTES.OrderDetail, { orderId: 'order-99' });
  });
});
