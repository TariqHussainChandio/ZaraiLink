import React from 'react';
import { screen } from '@testing-library/react-native';
import { DealerDashboardScreen } from './DashboardScreen';
import { renderWithProviders } from '../../testUtils/renderWithProviders';
import { useAuthStore } from '../../state/authStore';
import { fetchOrdersForUser } from '../../common/orders/services/ordersService';
import { fetchDealerAnalytics } from '../../common/analytics/services/analyticsService';

// DealerDashboardScreen is a thin wrapper around SellerDashboard, which reads useNavigation() directly and needs a
// real navigator context.
jest.mock('../../common/orders/services/ordersService', () => ({ fetchOrdersForUser: jest.fn() }));
jest.mock('../../common/analytics/services/analyticsService', () => ({
  fetchFarmerAnalytics: jest.fn(),
  fetchDealerAnalytics: jest.fn(),
}));

beforeEach(() => {
  useAuthStore.setState({ user: { id: 'dealer-1' } as never, role: 'dealer' as never });
  (fetchOrdersForUser as jest.Mock).mockResolvedValue([]);
  (fetchDealerAnalytics as jest.Mock).mockResolvedValue({
    activeListings: 6,
    pendingOrders: 1,
    lowStockCount: 1,
    storeCount: 1,
    supplierCount: 1,
  });
});

describe('DealerDashboardScreen', () => {
  it('renders the dealer variant of the shared seller dashboard', async () => {
    await renderWithProviders(<DealerDashboardScreen />);
    expect(await screen.findByText('Low Stock')).toBeTruthy();
    expect(screen.getByText('Products')).toBeTruthy();
    expect(screen.getByText('6')).toBeTruthy();
  });
});
