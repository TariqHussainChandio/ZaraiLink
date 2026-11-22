import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { DealerDashboardScreen } from './DashboardScreen';
import { renderWithProviders } from '../../testUtils/renderWithProviders';
import { useAuthStore } from '../../state/authStore';
import { fetchOrdersForUser } from '../../common/orders/services/ordersService';
import { fetchDealerAnalytics } from '../../common/analytics/services/analyticsService';
import { fetchDealerApplication } from '../../common/auth/services/applicationService';

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
  totalSales: 50000,
  bestSellers: [{ listingId: 'l1', title: 'Sona Urea', unitsSold: 40, revenue: 30000 }],
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
  useAuthStore.setState({
    user: { id: 'dealer-1' } as never,
    role: 'dealer' as never,
    profile: { id: 'dealer-1', role: 'dealer', account_status: 'approved', is_suspended: false } as never,
  });
  (fetchOrdersForUser as jest.Mock).mockResolvedValue([
    order('o1', 'ready', 'Sona Urea', 20, 'bags'),
    order('o2', 'pending', 'Karate, 1 L', 4, 'bottles'),
  ]);
  (fetchDealerApplication as jest.Mock).mockResolvedValue({ id: 'dealer-1', business_name: 'Green Inputs' });
  (fetchDealerAnalytics as jest.Mock).mockResolvedValue(analytics);
});

describe('DealerDashboardScreen (D20: the marketplace shop, and only that)', () => {
  it("shows the shop's figures, each opening what it counts", async () => {
    await renderWithProviders(<DealerDashboardScreen />);
    expect(await screen.findByLabelText(/^Total sales: Rs 50,000/)).toBeTruthy();
    expect(screen.getByLabelText(/^Orders: 4/)).toBeTruthy();
    expect(screen.getByLabelText(/^To confirm: 1/)).toBeTruthy();
    expect(screen.getByLabelText(/^To dispatch: 1/)).toBeTruthy();
    expect(screen.getByLabelText(/^Listings: 6/)).toBeTruthy();
    expect(screen.queryByText('Products')).toBeNull();

    await fireEvent.press(screen.getByLabelText(/^To dispatch: 1/));
    expect(mockTabNavigate).toHaveBeenCalledWith('Orders', { screen: 'OrderHistory', params: undefined, initial: false });
    await fireEvent.press(screen.getByLabelText(/^Listings: 6/));
    expect(mockNavigate).toHaveBeenCalledWith('MyListings');
  });

  it('lists the best sellers and sums the completed sales of this month', async () => {
    const now = new Date().toISOString();
    (fetchOrdersForUser as jest.Mock).mockResolvedValue([
      order('o3', 'completed', 'DAP', 5, 'bags', { updated_at: now }),
      order('o4', 'completed', 'DAP', 5, 'bags', { updated_at: now }),
      order('o5', 'completed', 'DAP', 5, 'bags', { updated_at: '2020-01-01T00:00:00Z' }),
    ]);
    await renderWithProviders(<DealerDashboardScreen />);
    expect(await screen.findByLabelText(/^This month: Rs 24,800, 2 completed orders/)).toBeTruthy();
    expect(screen.getByText('Sona Urea')).toBeTruthy();
    expect(screen.getByText('40 units sold · Rs 30,000')).toBeTruthy();
  });

  it('starts a listing from the shop', async () => {
    await renderWithProviders(<DealerDashboardScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'New listing' }));
    expect(mockTabNavigate).toHaveBeenCalledWith('Marketplace', { screen: 'CreateListing', params: undefined, initial: false });
  });

  it('shows no alerts, no stock figures, no inventory entry and no business name: those live elsewhere', async () => {
    await renderWithProviders(<DealerDashboardScreen />);
    await screen.findByLabelText(/^Listings: 6/);
    for (const absent of ['Alerts', 'Needs you', 'Dispatch 20 bags of Sona Urea', '2 items are running low', 'Open inventory system', 'Green Inputs']) {
      expect(screen.queryByText(absent)).toBeNull();
    }
  });

  it('shows an error Banner and a dash, never zero, when the figures fail to load', async () => {
    (fetchDealerAnalytics as jest.Mock).mockRejectedValue(new Error('network down'));
    await renderWithProviders(<DealerDashboardScreen />);
    expect(await screen.findByText("Couldn't load your shop figures")).toBeTruthy();
    expect(await screen.findByLabelText(/^To dispatch: not available/)).toBeTruthy();
  });

  it('shows an error Banner when the orders fail to load', async () => {
    (fetchOrdersForUser as jest.Mock).mockRejectedValue(new Error('network down'));
    await renderWithProviders(<DealerDashboardScreen />);
    expect(await screen.findByText("Couldn't load your orders")).toBeTruthy();
    expect(await screen.findByLabelText(/^This month: not available/)).toBeTruthy();
  });

  it('asks a dealer approved before A3b, with no business details, to add them', async () => {
    (fetchDealerApplication as jest.Mock).mockResolvedValue(null);
    await renderWithProviders(<DealerDashboardScreen />);
    expect(await screen.findByText('Add your business details')).toBeTruthy();
    expect(screen.getByText('Add details')).toBeTruthy();
  });

  it('says nothing about business details once they are saved', async () => {
    await renderWithProviders(<DealerDashboardScreen />);
    await screen.findByLabelText(/^Listings: 6/);
    expect(screen.queryByText('Add your business details')).toBeNull();
  });
});
