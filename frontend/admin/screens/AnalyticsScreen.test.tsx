import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { AdminAnalyticsScreen } from './AnalyticsScreen';
import { fetchAdminAnalytics } from '../../common/analytics/services/analyticsService';
import type { AdminAnalytics } from '../../common/analytics/types/analytics';

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

    expect(await screen.findByText('Listed now')).toBeTruthy();
    expect(screen.getByText('10')).toBeTruthy();
    expect(screen.getByText('40')).toBeTruthy();
    expect(screen.getByText('30')).toBeTruthy();
    expect(screen.getByText('20')).toBeTruthy();
    expect(screen.getByText('Rs 5,000')).toBeTruthy();
    expect(screen.getByText('6')).toBeTruthy();
  });

  it('renders payments and reports broken down by status', async () => {
    mockFetchAnalytics.mockResolvedValue(analytics());
    await renderWithQuery(<AdminAnalyticsScreen />);

    await screen.findByText('Listed now');
    // The vocabulary's words, as on every payment badge, never the raw value.
    expect(screen.getByText('Paid')).toBeTruthy();
    expect(screen.getByText('Awaiting payment')).toBeTruthy();
    expect(screen.queryByText('Successful')).toBeNull();
    expect(screen.getByText('Open')).toBeTruthy();
    expect(screen.getByText('Resolved')).toBeTruthy();
    expect(screen.getByText(/7 approved experts/)).toBeTruthy();
    expect(screen.getByText(/75%/)).toBeTruthy();
  });

  it('names the months, and reads each chart aloud with its figures (AD-19)', async () => {
    mockFetchAnalytics.mockResolvedValue(analytics());
    await renderWithQuery(<AdminAnalyticsScreen />);

    await screen.findByText('Listed now');
    // The API sends "2026-07"; the axis says "Jul", not "07".
    expect(screen.getAllByText('Jul').length).toBeGreaterThan(0);
    expect(screen.queryByText('07')).toBeNull();
    expect(screen.getByLabelText('New users each month: Jul 45')).toBeTruthy();
    expect(screen.getByLabelText('Orders each month: Jul 8')).toBeTruthy();
  });

  it('labels the experts figure for what it counts', async () => {
    mockFetchAnalytics.mockResolvedValue(analytics());
    await renderWithQuery(<AdminAnalyticsScreen />);
    expect(await screen.findByText('Experts waiting for approval')).toBeTruthy();
    expect(screen.queryByText('Pending Verifications')).toBeNull();
  });

  it('shows an empty message for charts with no data points', async () => {
    mockFetchAnalytics.mockResolvedValue(analytics({ userGrowth: [], orderVolume: [] }));
    await renderWithQuery(<AdminAnalyticsScreen />);

    await screen.findByText('Listed now');
    expect(screen.getByText('No signups yet')).toBeTruthy();
    expect(screen.getByText('No orders yet')).toBeTruthy();
  });

  it("shows a retry state when loading fails, and retries on demand", async () => {
    mockFetchAnalytics.mockRejectedValueOnce(new Error('network down'));
    await renderWithQuery(<AdminAnalyticsScreen />);

    expect(await screen.findByText("Couldn't load analytics")).toBeTruthy();

    mockFetchAnalytics.mockResolvedValueOnce(analytics());
    await fireEvent.press(screen.getByText('Try again'));

    await waitFor(() => expect(screen.getByText('Listed now')).toBeTruthy());
    expect(mockFetchAnalytics).toHaveBeenCalledTimes(2);
  });
});
