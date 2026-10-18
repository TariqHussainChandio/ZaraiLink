import React from 'react';
import { screen } from '@testing-library/react-native';
import { DealerDashboardScreen } from './DashboardScreen';
import { renderWithProviders } from '../../testUtils/renderWithProviders';
import { useAuthStore } from '../../state/authStore';
import { fetchOrdersForUser } from '../../common/orders/services/ordersService';
import { fetchDealerAnalytics } from '../../common/analytics/services/analyticsService';
import { fetchDealerApplication } from '../../common/auth/services/applicationService';

// DealerDashboardScreen is a thin wrapper around SellerDashboard, which reads useNavigation() directly and needs a
// real navigator context.
jest.mock('../../common/orders/services/ordersService', () => ({ fetchOrdersForUser: jest.fn() }));
jest.mock('../../common/auth/services/applicationService', () => ({ fetchDealerApplication: jest.fn() }));
jest.mock('../../common/analytics/services/analyticsService', () => ({
  fetchFarmerAnalytics: jest.fn(),
  fetchDealerAnalytics: jest.fn(),
}));

beforeEach(() => {
  useAuthStore.setState({ user: { id: 'dealer-1' } as never, role: 'dealer' as never });
  (fetchOrdersForUser as jest.Mock).mockResolvedValue([]);
  (fetchDealerApplication as jest.Mock).mockResolvedValue({ id: 'dealer-1', business_name: 'Green Inputs' });
  (fetchDealerAnalytics as jest.Mock).mockResolvedValue({
    activeListings: 6,
    pendingOrders: 1,
    readyToDispatch: 0,
    lowStockCount: 1,
    storeCount: 1,
    supplierCount: 1,
  });
});

describe('DealerDashboardScreen', () => {
  it('renders the dealer variant of the shared seller dashboard', async () => {
    await renderWithProviders(<DealerDashboardScreen />);
    expect(await screen.findByText('Low Stock')).toBeTruthy();
    expect(screen.getByText('My Listings')).toBeTruthy();
    expect(screen.getByText('6')).toBeTruthy();
  });

  it('asks a dealer approved before A3b, with no business details, to add them', async () => {
    (fetchDealerApplication as jest.Mock).mockResolvedValue(null);
    await renderWithProviders(<DealerDashboardScreen />);
    expect(await screen.findByText('Add your business details')).toBeTruthy();
    expect(screen.getByText('Add details')).toBeTruthy();
  });

  it('says nothing about business details once they are saved', async () => {
    await renderWithProviders(<DealerDashboardScreen />);
    await screen.findByText('Low Stock');
    expect(screen.queryByText('Add your business details')).toBeNull();
  });
});
