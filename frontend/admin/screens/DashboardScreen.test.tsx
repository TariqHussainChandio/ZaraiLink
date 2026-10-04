import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { AdminDashboardScreen } from './DashboardScreen';
import { fetchPlatformStats, type PlatformStats } from '../services/adminService';
import { ADMIN_HOME_ROUTES } from '../../common/constants/routes';
import type { AdminScreenProps } from '../../navigation/stacks/AdminNavigator';

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

jest.mock('../services/adminService', () => ({
  fetchPlatformStats: jest.fn(),
}));

const mockFetchStats = fetchPlatformStats as jest.Mock;

const stats = (overrides: Partial<PlatformStats> = {}): PlatformStats => ({
  totalUsers: 120,
  usersByRole: { farmer: 60, buyer: 30, dealer: 20, expert: 10 },
  totalListings: 55,
  totalOrders: 33,
  ...overrides,
});

function makeNavigation() {
  return { navigate: jest.fn() } as unknown as AdminScreenProps<'Dashboard'>['navigation'];
}

beforeEach(() => {
  mockFetchStats.mockReset();
});

describe('AdminDashboardScreen', () => {
  it('loads and renders the platform totals', async () => {
    mockFetchStats.mockResolvedValue(stats());
    await renderWithQuery(<AdminDashboardScreen navigation={makeNavigation()} route={{} as never} />);

    expect(await screen.findByText('120')).toBeTruthy();
    expect(screen.getByText('55')).toBeTruthy();
    expect(screen.getByText('33')).toBeTruthy();
  });

  it('shows a breakdown of users by role', async () => {
    mockFetchStats.mockResolvedValue(stats());
    await renderWithQuery(<AdminDashboardScreen navigation={makeNavigation()} route={{} as never} />);

    await screen.findByText('120');
    expect(screen.getByText('Farmer')).toBeTruthy();
    expect(screen.getByText('60')).toBeTruthy();
    expect(screen.getByText('Buyer')).toBeTruthy();
    expect(screen.getByText('Dealer')).toBeTruthy();
    expect(screen.getByText('Expert')).toBeTruthy();
  });

  it("shows a retry state when loading fails", async () => {
    mockFetchStats.mockRejectedValueOnce(new Error('offline'));
    await renderWithQuery(<AdminDashboardScreen navigation={makeNavigation()} route={{} as never} />);

    expect(await screen.findByText("Couldn't load the dashboard")).toBeTruthy();

    mockFetchStats.mockResolvedValueOnce(stats());
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('120')).toBeTruthy();
  });

  it('links the overview to analytics and notifications; the other destinations have their own tabs', async () => {
    mockFetchStats.mockResolvedValue(stats());
    const navigation = makeNavigation();
    await renderWithQuery(<AdminDashboardScreen navigation={navigation} route={{} as never} />);
    await screen.findByText('120');

    await fireEvent.press(screen.getByText('Analytics'));
    expect(navigation.navigate).toHaveBeenCalledWith(ADMIN_HOME_ROUTES.Analytics);

    await fireEvent.press(screen.getByText('Notifications'));
    expect(navigation.navigate).toHaveBeenCalledWith(ADMIN_HOME_ROUTES.Notifications);

    expect(screen.queryByText('Manage Users')).toBeNull();
    expect(screen.queryByText('Audit Logs')).toBeNull();
  });
});
