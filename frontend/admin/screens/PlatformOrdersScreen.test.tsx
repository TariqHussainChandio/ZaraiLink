import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { PlatformOrdersScreen } from './PlatformOrdersScreen';
import { fetchAllOrders } from '../services/adminService';
import { ADMIN_HOME_ROUTES } from '../../common/constants/routes';
import type { OrderWithItems } from '../../common/orders/types/orders';

const mockNavigate = jest.fn();

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
    useNavigation: () => ({ navigate: mockNavigate }),
  };
});

jest.mock('../services/adminService', () => ({
  fetchAllOrders: jest.fn(),
}));

const mockFetchAllOrders = fetchAllOrders as jest.Mock;

const order = (overrides: Partial<OrderWithItems> = {}): OrderWithItems => ({
  id: 'order-1',
  buyer_id: 'buyer-1',
  seller_id: 'seller-1',
  status: 'pending',
  product_subtotal: 500,
  delivery_charge: 0,
  total: 500,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  order_items: [{ id: 'item-1', order_id: 'order-1', listing_id: 'listing-1', quantity: 2, unit_price: 250, created_at: '2026-01-01T00:00:00Z', listing: { title: 'Wheat seeds', unit: 'kg' } }],
  buyer: { id: 'buyer-1', full_name: 'Buyer Bilal' },
  seller: { id: 'seller-1', full_name: 'Seller Sana' },
  ...overrides,
});

beforeEach(() => {
  mockFetchAllOrders.mockReset();
  mockNavigate.mockReset();
});

describe('PlatformOrdersScreen', () => {
  it('shows an empty state when there are no orders', async () => {
    mockFetchAllOrders.mockResolvedValue([]);
    await renderWithQuery(<PlatformOrdersScreen />);
    expect(await screen.findByText('No orders yet')).toBeTruthy();
  });

  it('lists orders with buyer and seller names', async () => {
    mockFetchAllOrders.mockResolvedValue([order()]);
    await renderWithQuery(<PlatformOrdersScreen />);
    expect(await screen.findByText(/Buyer Bilal/)).toBeTruthy();
    expect(screen.getByText(/Seller Sana/)).toBeTruthy();
  });

  it('navigates to the order detail screen on press', async () => {
    mockFetchAllOrders.mockResolvedValue([order()]);
    await renderWithQuery(<PlatformOrdersScreen />);
    await screen.findByText(/Buyer Bilal/);

    await fireEvent.press(screen.getByText(/Buyer Bilal/));

    expect(mockNavigate).toHaveBeenCalledWith(ADMIN_HOME_ROUTES.OrderDetail, { orderId: 'order-1' });
  });
});
