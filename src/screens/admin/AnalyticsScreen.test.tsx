import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { AdminAnalyticsScreen } from './AnalyticsScreen';
import { fetchAdminAnalytics } from '../../services/modules/analytics/analyticsService';
import type { AdminAnalytics } from '../../types/analytics';

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
  fetchAdminAnalytics: jest.fn(),
}));

const mockFetchAnalytics = fetchAdminAnalytics as jest.Mock;

const analytics = (overrides: Partial<AdminAnalytics> = {}): AdminAnalytics => ({
  userGrowth: [{ month: '2026-07', value: 45 }],
  usersByRole: { farmer: 5, buyer: 3, dealer: 2 },
  totalListings: 40,
  activeListings: 30,
  orderVolume: [{ month: '2026-07', value: 8 }],
  totalOrders: 20,
  paymentsByStatus: { successful: 12, pending: 3 },
  paymentsTotal: 5000,
  reportsByStatus: { open: 2, resolved: 4 },
  pendingExpertVerifications: 6,
  approvedExperts: 7,
  consultationResolutionRate: 0.75,
  ...overrides,
});

beforeEach(() => {
  mockFetchAnalytics.mockReset();
});

describe('AdminAnalyticsScreen', () => {
  it('loads and renders the platform stats', async () => {
    mockFetchAnalytics.mockResolvedValue(analytics());
    await renderWithQuery(<AdminAnalyticsScreen />);

    expect(await screen.findByText('Total Listings')).toBeTruthy();
    expect(screen.getByText('10')).toBeTruthy();
    expect(screen.getByText('40')).toBeTruthy();
    expect(screen.getByText('30')).toBeTruthy();
    expect(screen.getByText('20')).toBeTruthy();
    expect(screen.getByText('Rs. 5000')).toBeTruthy();
    expect(screen.getByText('6')).toBeTruthy();
  });

  it('renders payments and reports broken down by status', async () => {
    mockFetchAnalytics.mockResolvedValue(analytics());
    await renderWithQuery(<AdminAnalyticsScreen />);

    await screen.findByText('Total Listings');
    expect(screen.getByText('Successful')).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
    expect(screen.getByText('Open')).toBeTruthy();
    expect(screen.getByText('Resolved')).toBeTruthy();
    expect(screen.getByText(/Approved experts: 7/)).toBeTruthy();
    expect(screen.getByText(/75%/)).toBeTruthy();
  });

  it('shows an empty message for charts with no data points', async () => {
    mockFetchAnalytics.mockResolvedValue(analytics({ userGrowth: [], orderVolume: [] }));
    await renderWithQuery(<AdminAnalyticsScreen />);

    await screen.findByText('Total Listings');
    expect(screen.getByText('No signups yet')).toBeTruthy();
    expect(screen.getByText('No orders yet')).toBeTruthy();
  });

  it("shows a retry state when loading fails, and retries on demand", async () => {
    mockFetchAnalytics.mockRejectedValueOnce(new Error('network down'));
    await renderWithQuery(<AdminAnalyticsScreen />);

    expect(await screen.findByText("Couldn't load analytics")).toBeTruthy();

    mockFetchAnalytics.mockResolvedValueOnce(analytics());
    await fireEvent.press(screen.getByText('Retry'));

    await waitFor(() => expect(screen.getByText('Total Listings')).toBeTruthy());
    expect(mockFetchAnalytics).toHaveBeenCalledTimes(2);
  });
});
