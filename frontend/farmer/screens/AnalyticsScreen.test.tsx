import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { FarmerAnalyticsScreen } from './AnalyticsScreen';
import { fetchFarmerAnalytics } from '../../common/analytics/services/analyticsService';
import { useAuthStore } from '../../state/authStore';
import type { FarmerAnalytics } from '../../common/analytics/types/analytics';

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

jest.mock('../../common/analytics/services/analyticsService', () => ({
  fetchFarmerAnalytics: jest.fn(),
}));

const mockFetchFarmerAnalytics = fetchFarmerAnalytics as jest.Mock;

const analytics: FarmerAnalytics = {
  activeListings: 3,
  pendingOrders: 1,
  readyToDispatch: 0,
  totalListingViews: 42,
  totalOrders: 6,
  totalSales: 1500,
  // The API ranks by units: rice sold fewer units but earned more.
  popularProducts: [
    { listingId: 'l1', title: 'Wheat', unitsSold: 10, revenue: 1000 },
    { listingId: 'l2', title: 'Rice', unitsSold: 1, revenue: 5000 },
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
  it('says the sales in words, shows the tiles and ranks products by what they earned', async () => {
    mockFetchFarmerAnalytics.mockResolvedValue(analytics);
    await renderWithQuery(<FarmerAnalyticsScreen />);

    expect(await screen.findByText('Rs 1,500 in completed sales')).toBeTruthy();
    expect(screen.getByText('Listing views')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText('6')).toBeTruthy();
    // Rice earned more, so it ranks first; each product appears once, not again in a chart.
    expect(screen.getByText('1. Rice')).toBeTruthy();
    expect(screen.getByText('2. Wheat')).toBeTruthy();
    expect(screen.getByText('1 unit sold')).toBeTruthy();
    expect(screen.getByText('10 units sold')).toBeTruthy();
    expect(screen.getByText('Rs 5,000')).toBeTruthy();
  });

  it('explains an empty ranking instead of drawing an empty chart', async () => {
    mockFetchFarmerAnalytics.mockResolvedValue({ ...analytics, popularProducts: [] });
    await renderWithQuery(<FarmerAnalyticsScreen />);

    expect(await screen.findByText(/No completed sales yet/)).toBeTruthy();
  });

  it('shows the failure with Try again and no zero figures, then recovers', async () => {
    mockFetchFarmerAnalytics.mockRejectedValue(new Error('Network error'));
    await renderWithQuery(<FarmerAnalyticsScreen />);

    expect(await screen.findByText("Couldn't load your analytics")).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();

    mockFetchFarmerAnalytics.mockResolvedValue(analytics);
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('Listing views')).toBeTruthy();
  });
});
