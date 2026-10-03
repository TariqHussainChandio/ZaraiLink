import React from 'react';
import { screen, waitFor } from '@testing-library/react-native';
import { SellerDashboard } from './SellerDashboard';
import { renderWithProviders } from '../../../testUtils/renderWithProviders';
import { useAuthStore } from '../../../state/authStore';
import { fetchOrdersForUser } from '../../orders/services/ordersService';
import { fetchDealerAnalytics, fetchFarmerAnalytics } from '../services/analyticsService';

jest.mock('../../orders/services/ordersService', () => ({ fetchOrdersForUser: jest.fn() }));
jest.mock('../services/analyticsService', () => ({
  fetchFarmerAnalytics: jest.fn(),
  fetchDealerAnalytics: jest.fn(),
}));

const mockFetchOrdersForUser = fetchOrdersForUser as jest.Mock;
const mockFetchFarmerAnalytics = fetchFarmerAnalytics as jest.Mock;
const mockFetchDealerAnalytics = fetchDealerAnalytics as jest.Mock;

// Every stat gets a distinct number so a value shown under the wrong label cannot pass by coincidence.
const farmerStats = {
  activeListings: 4,
  pendingOrders: 2,
  farmCount: 3,
  cropCount: 7,
  openConsultations: 6,
  resolvedConsultations: 8,
};
const dealerStats = { activeListings: 9, pendingOrders: 11, lowStockCount: 1, storeCount: 3, supplierCount: 5 };

describe('SellerDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchOrdersForUser.mockResolvedValue([]);
    mockFetchFarmerAnalytics.mockResolvedValue(farmerStats);
    mockFetchDealerAnalytics.mockResolvedValue(dealerStats);
  });

  it("renders a farmer's listing, order, farm and consultation figures from the analytics endpoint", async () => {
    useAuthStore.setState({ user: { id: 'u1' } as never, role: 'farmer' as never });
    await renderWithProviders(<SellerDashboard />);
    expect(await screen.findByText('Farms')).toBeTruthy();
    for (const value of ['4', '2', '3', '7', '6', '8']) expect(screen.getByText(value)).toBeTruthy();
    expect(mockFetchFarmerAnalytics).toHaveBeenCalledTimes(1);
    expect(mockFetchDealerAnalytics).not.toHaveBeenCalled();
    expect(screen.queryByText('Low Stock')).toBeNull();
  });

  it("renders a dealer's listing, order, low stock, store and supplier figures", async () => {
    useAuthStore.setState({ user: { id: 'u1' } as never, role: 'dealer' as never });
    await renderWithProviders(<SellerDashboard />);
    expect(await screen.findByText('Low Stock')).toBeTruthy();
    for (const value of ['9', '11', '1', '3', '5']) expect(screen.getByText(value)).toBeTruthy();
    expect(mockFetchDealerAnalytics).toHaveBeenCalledTimes(1);
    expect(mockFetchFarmerAnalytics).not.toHaveBeenCalled();
    expect(screen.queryByText('Farms')).toBeNull();
  });

  it('does not ask a buyer for seller analytics (the endpoints are role-restricted)', async () => {
    useAuthStore.setState({ user: { id: 'u1' } as never, role: 'buyer' as never });
    await renderWithProviders(<SellerDashboard />);
    expect(await screen.findByText('Active Listings')).toBeTruthy();
    expect(mockFetchFarmerAnalytics).not.toHaveBeenCalled();
    expect(mockFetchDealerAnalytics).not.toHaveBeenCalled();
    expect(screen.queryByText('Farms')).toBeNull();
    expect(screen.queryByText('Low Stock')).toBeNull();
  });

  it('shows recent sales in the activity feed once loaded', async () => {
    useAuthStore.setState({ user: { id: 'u1' } as never, role: 'farmer' as never });
    mockFetchOrdersForUser.mockResolvedValue([
      {
        id: 'o1',
        total: 500,
        status: 'completed',
        buyer: { id: 'b1', full_name: 'Bilal' },
        seller: { id: 'u1', full_name: 'Me' },
      },
    ]);
    await renderWithProviders(<SellerDashboard />);
    expect(await screen.findByText('Bilal')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Rs 500 · Completed')).toBeTruthy());
    expect(mockFetchOrdersForUser).toHaveBeenCalledWith('seller');
  });
});
