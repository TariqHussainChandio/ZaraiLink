import React from 'react';
import { screen } from '@testing-library/react-native';
import { FarmerDashboardScreen } from './DashboardScreen';
import { renderWithProviders } from '../../testUtils/renderWithProviders';
import { useAuthStore } from '../../state/authStore';
import { fetchOrdersForUser } from '../../common/orders/services/ordersService';
import { fetchFarmerAnalytics } from '../../common/analytics/services/analyticsService';

jest.mock('../../common/orders/services/ordersService', () => ({ fetchOrdersForUser: jest.fn() }));
jest.mock('../../common/analytics/services/analyticsService', () => ({
  fetchFarmerAnalytics: jest.fn(),
  fetchDealerAnalytics: jest.fn(),
}));

beforeEach(() => {
  (fetchOrdersForUser as jest.Mock).mockResolvedValue([]);
  (fetchFarmerAnalytics as jest.Mock).mockResolvedValue({
    activeListings: 3,
    pendingOrders: 1,
    readyToDispatch: 0,
    farmCount: 2,
    cropCount: 5,
    openConsultations: 4,
    resolvedConsultations: 6,
  });
  useAuthStore.setState({ user: { id: 'u1' } as never, role: 'farmer' as never });
});

describe('FarmerDashboardScreen', () => {
  it('renders the shared SellerDashboard with the farmer stats', async () => {
    await renderWithProviders(<FarmerDashboardScreen />);

    expect(await screen.findByText('Active Listings')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('Farms')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('Farms & Crops')).toBeTruthy();
    expect(screen.getByText('Disease Advisory')).toBeTruthy();
  });
});
