import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { DealerDashboardScreen } from './DashboardScreen';
import { renderWithProviders } from '../../testUtils/renderWithProviders';
import { useAuthStore } from '../../state/authStore';
import { fetchOrdersForUser } from '../../common/orders/services/ordersService';
import { fetchDealerAnalytics } from '../../common/analytics/services/analyticsService';
import { fetchDealerApplication } from '../../common/auth/services/applicationService';
import { HOME_ROUTES } from '../../common/constants/routes';

// The screen reads useNavigation() directly, so it renders inside a real navigator (renderWithProviders). The tab
// navigator is absent there, which makes jumps into another tab no-ops; the Home stack's own navigate is spied on.
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return { ...actual, useNavigation: () => ({ ...actual.useNavigation(), navigate: mockNavigate }) };
});
const mockTabNavigate = jest.fn();
jest.mock('../../navigation/stacks/useAppTabNavigation', () => ({
  useAppTabNavigation: () => ({ navigate: mockTabNavigate }),
}));
jest.mock('../../common/orders/services/ordersService', () => ({ fetchOrdersForUser: jest.fn() }));
jest.mock('../../common/auth/services/applicationService', () => ({ fetchDealerApplication: jest.fn() }));
jest.mock('../../common/analytics/services/analyticsService', () => ({
  fetchFarmerAnalytics: jest.fn(),
  fetchDealerAnalytics: jest.fn(),
}));

function order(id: string, status: string, title: string, quantity: number, unit: string, extra = {}) {
  return {
    id,
    status,
    total: 12400,
    created_at: '2026-11-05T08:00:00Z',
    updated_at: '2026-11-06T08:00:00Z',
    buyer: { id: 'b1', full_name: 'Nadia Batool' },
    order_items: [{ id: `${id}-i`, quantity, listing: { title, unit } }],
    ...extra,
  };
}

const analytics = {
  activeListings: 6,
  pendingOrders: 1,
  readyToDispatch: 1,
  totalOrders: 4,
  lowStockCount: 2,
  storeCount: 1,
  supplierCount: 1,
};

beforeEach(() => {
  mockNavigate.mockReset();
  mockTabNavigate.mockReset();
  useAuthStore.setState({ user: { id: 'dealer-1' } as never, role: 'dealer' as never });
  (fetchOrdersForUser as jest.Mock).mockResolvedValue([
    order('o1', 'ready', 'Sona Urea', 20, 'bags'),
    order('o2', 'pending', 'Karate, 1 L', 4, 'bottles'),
  ]);
  (fetchDealerApplication as jest.Mock).mockResolvedValue({ id: 'dealer-1', business_name: 'Green Inputs' });
  (fetchDealerAnalytics as jest.Mock).mockResolvedValue(analytics);
});

describe('DealerDashboardScreen', () => {
  it('leads with what is waiting and lists each item that needs the dealer', async () => {
    await renderWithProviders(<DealerDashboardScreen />);
    expect(await screen.findByText('1 order to dispatch')).toBeTruthy();
    expect(screen.getByText('Needs you')).toBeTruthy();
    expect(screen.getByText('Dispatch 20 bags of Sona Urea')).toBeTruthy();
    expect(screen.getByText('Confirm 4 bottles of Karate, 1 L')).toBeTruthy();
    expect(await screen.findByText('2 items are running low')).toBeTruthy();
  });

  it('opens the order behind a "Needs you" row inside the Orders tab', async () => {
    await renderWithProviders(<DealerDashboardScreen />);
    await fireEvent.press(await screen.findByText('Dispatch 20 bags of Sona Urea'));
    expect(mockTabNavigate).toHaveBeenCalledWith('Orders', { screen: 'OrderDetail', params: { orderId: 'o1' }, initial: false });
  });

  it('shows one Inventory system card that opens the inventory system, with low stock as a badge', async () => {
    await renderWithProviders(<DealerDashboardScreen />);
    expect((await screen.findAllByText('Low stock')).length).toBe(2);
    await fireEvent.press(screen.getByText('Open inventory system'));
    expect(mockNavigate).toHaveBeenCalledWith(HOME_ROUTES.Inventory);
  });

  it('calls the shop "Listings", never "Products", and sums this month\'s completed sales', async () => {
    const now = new Date().toISOString();
    (fetchOrdersForUser as jest.Mock).mockResolvedValue([
      order('o3', 'completed', 'DAP', 5, 'bags', { updated_at: now }),
      order('o4', 'completed', 'DAP', 5, 'bags', { updated_at: now }),
      order('o5', 'completed', 'DAP', 5, 'bags', { updated_at: '2020-01-01T00:00:00Z' }),
    ]);
    await renderWithProviders(<DealerDashboardScreen />);
    expect(await screen.findByText('Listings')).toBeTruthy();
    expect(screen.queryByText('Products')).toBeNull();
    expect(await screen.findByText('Rs 24,800 from 2 orders')).toBeTruthy();
    expect(await screen.findByText('6 active listings')).toBeTruthy();
  });

  it('shows an error Banner and a dash, never zero, when the orders fail to load', async () => {
    (fetchOrdersForUser as jest.Mock).mockRejectedValue(new Error('network down'));
    await renderWithProviders(<DealerDashboardScreen />);
    expect(await screen.findByText("Couldn't load your orders")).toBeTruthy();
    expect(screen.getByText('Orders did not load')).toBeTruthy();
    expect(screen.queryByText('Nothing needs you right now')).toBeNull();
    expect(screen.queryByText(/\b0 /)).toBeNull();
  });

  it('shows an error Banner when the shop figures fail, and does not claim stock is fine', async () => {
    (fetchDealerAnalytics as jest.Mock).mockRejectedValue(new Error('network down'));
    await renderWithProviders(<DealerDashboardScreen />);
    expect(await screen.findByText("Couldn't load your shop figures")).toBeTruthy();
    expect(await screen.findByText('Stock figures are not available right now.')).toBeTruthy();
    expect(screen.queryByText('Nothing is running low')).toBeNull();
  });

  it('asks a dealer approved before A3b, with no business details, to add them', async () => {
    (fetchDealerApplication as jest.Mock).mockResolvedValue(null);
    await renderWithProviders(<DealerDashboardScreen />);
    expect(await screen.findByText('Add your business details')).toBeTruthy();
    expect(screen.getByText('Add details')).toBeTruthy();
  });

  it('says nothing about business details once they are saved', async () => {
    await renderWithProviders(<DealerDashboardScreen />);
    await screen.findByText('Green Inputs');
    expect(screen.queryByText('Add your business details')).toBeNull();
  });
});
