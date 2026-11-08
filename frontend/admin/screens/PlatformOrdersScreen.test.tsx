import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { PlatformOrdersScreen } from './PlatformOrdersScreen';
import { fetchOrdersPage } from '../services/adminService';
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
  fetchOrdersPage: jest.fn(),
}));

const mockFetchPage = fetchOrdersPage as jest.Mock;

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

const page = (rows: OrderWithItems[], next: { limit: number; offset: number } | null = null) => ({ data: rows, next });

beforeEach(() => {
  mockFetchPage.mockReset();
  mockNavigate.mockReset();
});

describe('PlatformOrdersScreen', () => {
  it('shows an empty state when there are no orders', async () => {
    mockFetchPage.mockResolvedValue(page([]));
    await renderWithQuery(<PlatformOrdersScreen />);
    expect(await screen.findByText('No orders yet')).toBeTruthy();
  });

  it('says the load failed instead of "No orders yet" (AD-11)', async () => {
    mockFetchPage.mockRejectedValueOnce(new Error('boom'));
    await renderWithQuery(<PlatformOrdersScreen />);
    expect(await screen.findByText("Couldn't load orders")).toBeTruthy();
    expect(screen.queryByText('No orders yet')).toBeNull();
  });

  it('lists orders with buyer, seller, items, total and status', async () => {
    mockFetchPage.mockResolvedValue(page([order()]));
    await renderWithQuery(<PlatformOrdersScreen />);
    expect(await screen.findByText('Buyer Bilal → Seller Sana')).toBeTruthy();
    expect(screen.getByText(/2 × Wheat seeds/)).toBeTruthy();
    expect(screen.getByText('Rs 500')).toBeTruthy();
    // The filter chip and the row's badge use the same word.
    expect(screen.getAllByText('Pending')).toHaveLength(2);
  });

  it('navigates to the order detail screen on press', async () => {
    mockFetchPage.mockResolvedValue(page([order()]));
    await renderWithQuery(<PlatformOrdersScreen />);

    await fireEvent.press(await screen.findByText('Buyer Bilal → Seller Sana'));

    expect(mockNavigate).toHaveBeenCalledWith(ADMIN_HOME_ROUTES.OrderDetail, { orderId: 'order-1' });
  });

  it('filters by status and by a name', async () => {
    mockFetchPage.mockResolvedValue(
      page([order(), order({ id: 'order-2', status: 'completed', buyer: { id: 'b2', full_name: 'Buyer Ali' } })]),
    );
    await renderWithQuery(<PlatformOrdersScreen />);
    await screen.findByText('Buyer Bilal → Seller Sana');

    await fireEvent.press(screen.getByRole('button', { name: 'Completed' }));
    expect(screen.queryByText('Buyer Bilal → Seller Sana')).toBeNull();
    expect(screen.getByText('Buyer Ali → Seller Sana')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'All' }));
    await fireEvent.changeText(screen.getByLabelText('Find an order'), 'bilal');
    expect(screen.getByText('Buyer Bilal → Seller Sana')).toBeTruthy();
    expect(screen.queryByText('Buyer Ali → Seller Sana')).toBeNull();
  });

  it('loads older orders past the first page (AD-02)', async () => {
    mockFetchPage.mockResolvedValueOnce(page([order()], { limit: 50, offset: 50 }));
    mockFetchPage.mockResolvedValueOnce(page([order({ id: 'order-101', buyer: { id: 'b9', full_name: 'Buyer 101' } })]));
    await renderWithQuery(<PlatformOrdersScreen />);
    await screen.findByText('Buyer Bilal → Seller Sana');

    await fireEvent.press(screen.getByRole('button', { name: 'Load more orders' }));

    expect(await screen.findByText('Buyer 101 → Seller Sana')).toBeTruthy();
    expect(mockFetchPage).toHaveBeenLastCalledWith(50);
  });
});
