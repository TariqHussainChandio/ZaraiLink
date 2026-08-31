import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { FarmerAnalyticsScreen } from './AnalyticsScreen';
import { fetchFarmerAnalytics } from '../../services/modules/analytics/analyticsService';
import { useAuthStore } from '../../store/authStore';
import type { FarmerAnalytics } from '../../types/analytics';

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

jest.mock('../../services/modules/analytics/analyticsService', () => ({
  fetchFarmerAnalytics: jest.fn(),
}));

const mockFetchFarmerAnalytics = fetchFarmerAnalytics as jest.Mock;

const analytics: FarmerAnalytics = {
  totalListingViews: 42,
  totalOrders: 6,
  totalSales: 1500,
  popularProducts: [
    { listingId: 'l1', title: 'Wheat', unitsSold: 10, revenue: 1000 },
    { listingId: 'l2', title: 'Rice', unitsSold: 5, revenue: 500 },
  ],
  farmCount: 2,
  cropCount: 3,
  openConsultations: 1,
  resolvedConsultations: 4,
};

beforeEach(() => {
  mockFetchFarmerAnalytics.mockReset();
  useAuthStore.setState({ user: { id: 'user-1' } as never });
});

describe('FarmerAnalyticsScreen', () => {
  it('renders the loaded stats, bar chart, and top products', async () => {
    mockFetchFarmerAnalytics.mockResolvedValue(analytics);
    await render(<FarmerAnalyticsScreen />);

    expect(await screen.findByText('42')).toBeTruthy();
    expect(screen.getByText('Listing Views')).toBeTruthy();
    expect(screen.getByText('6')).toBeTruthy();
    expect(screen.getByText('Orders')).toBeTruthy();
    expect(screen.getByText('Rs. 1500')).toBeTruthy();
    expect(screen.getByText('Popular Products')).toBeTruthy();
    expect(screen.getByText('Top Products by Revenue')).toBeTruthy();
    expect(screen.getAllByText('Wheat')).toHaveLength(2);
    expect(screen.getByText('10 units sold')).toBeTruthy();
    expect(screen.getByText('Rs. 1000')).toBeTruthy();
  });

  it('shows a retry state when loading analytics fails', async () => {
    mockFetchFarmerAnalytics.mockRejectedValue(new Error('Network error'));
    await render(<FarmerAnalyticsScreen />);

    expect(await screen.findByText("Couldn't load analytics")).toBeTruthy();

    mockFetchFarmerAnalytics.mockResolvedValue(analytics);
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('Listing Views')).toBeTruthy();
  });
});
