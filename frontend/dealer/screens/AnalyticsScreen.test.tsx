import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { DealerAnalyticsScreen } from './AnalyticsScreen';
import { fetchDealerAnalytics } from '../../common/analytics/services/analyticsService';
import { useAuthStore } from '../../state/authStore';
import type { DealerAnalytics } from '../../common/analytics/types/analytics';

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
  fetchDealerAnalytics: jest.fn(),
}));

const mockFetchDealerAnalytics = fetchDealerAnalytics as jest.Mock;

const analytics: DealerAnalytics = {
  totalSales: 15000,
  activeListings: 3,
  pendingOrders: 1,
  totalOrders: 12,
  inventoryMovement: [{ month: '2026-01', value: 40 }],
  lowStockCount: 3,
  bestSellers: [{ listingId: 'l1', title: 'DAP Fertilizer', unitsSold: 20, revenue: 8000 }],
  storeCount: 2,
  supplierCount: 4,
};

beforeEach(() => {
  mockFetchDealerAnalytics.mockReset();
  useAuthStore.setState({ user: { id: 'dealer-1' } as never });
});

describe('DealerAnalyticsScreen', () => {
  it('renders stats, inventory movement, and best sellers once loaded', async () => {
    mockFetchDealerAnalytics.mockResolvedValue(analytics);
    await renderWithQuery(<DealerAnalyticsScreen />);

    expect(await screen.findByText('Rs. 15000')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('DAP Fertilizer')).toBeTruthy();
    expect(screen.getByText('Rs. 8000 revenue')).toBeTruthy();
    expect(screen.getByText('20 units')).toBeTruthy();
  });

  it('shows an error state with retry when analytics fail to load', async () => {
    mockFetchDealerAnalytics.mockRejectedValue(new Error('network down'));
    await renderWithQuery(<DealerAnalyticsScreen />);
    expect(await screen.findByText("Couldn't load analytics")).toBeTruthy();

    mockFetchDealerAnalytics.mockResolvedValue(analytics);
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('Rs. 15000')).toBeTruthy();
  });
});
