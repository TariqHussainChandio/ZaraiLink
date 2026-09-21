import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import '../../localization';
import { AdminDashboardScreen } from './DashboardScreen';
import { fetchPlatformStats, type PlatformStats } from '../../services/modules/admin/adminService';
import { ADMIN_HOME_ROUTES } from '../../constants/routes';
import type { AdminHomeScreenProps } from '../../navigation/stacks/AdminNavigator';

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

jest.mock('../../services/modules/admin/adminService', () => ({
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
  return { navigate: jest.fn() } as unknown as AdminHomeScreenProps<'Dashboard'>['navigation'];
}

beforeEach(() => {
  mockFetchStats.mockReset();
});

describe('AdminDashboardScreen', () => {
  it('loads and renders the platform totals', async () => {
    mockFetchStats.mockResolvedValue(stats());
    await render(<AdminDashboardScreen navigation={makeNavigation()} route={{} as never} />);

    expect(await screen.findByText('120')).toBeTruthy();
    expect(screen.getByText('55')).toBeTruthy();
    expect(screen.getByText('33')).toBeTruthy();
  });

  it('shows a breakdown of users by role', async () => {
    mockFetchStats.mockResolvedValue(stats());
    await render(<AdminDashboardScreen navigation={makeNavigation()} route={{} as never} />);

    await screen.findByText('120');
    expect(screen.getByText('Farmer')).toBeTruthy();
    expect(screen.getByText('60')).toBeTruthy();
    expect(screen.getByText('Buyer')).toBeTruthy();
    expect(screen.getByText('Dealer')).toBeTruthy();
    expect(screen.getByText('Expert')).toBeTruthy();
  });

  it("shows a retry state when loading fails", async () => {
    mockFetchStats.mockRejectedValueOnce(new Error('offline'));
    await render(<AdminDashboardScreen navigation={makeNavigation()} route={{} as never} />);

    expect(await screen.findByText("Couldn't load the dashboard")).toBeTruthy();

    mockFetchStats.mockResolvedValueOnce(stats());
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('120')).toBeTruthy();
  });

  it('navigates to each admin destination via Quick Actions', async () => {
    mockFetchStats.mockResolvedValue(stats());
    const navigation = makeNavigation();
    await render(<AdminDashboardScreen navigation={navigation} route={{} as never} />);
    await screen.findByText('120');

    await fireEvent.press(screen.getByText('Manage Users'));
    expect(navigation.navigate).toHaveBeenCalledWith(ADMIN_HOME_ROUTES.UserManagement);

    await fireEvent.press(screen.getByText('Moderate Listings'));
    expect(navigation.navigate).toHaveBeenCalledWith(ADMIN_HOME_ROUTES.ListingModeration);

    await fireEvent.press(screen.getByText('Expert Verification'));
    expect(navigation.navigate).toHaveBeenCalledWith(ADMIN_HOME_ROUTES.ExpertVerification);

    const ordersMatches = screen.getAllByText('Orders');
    await fireEvent.press(ordersMatches[ordersMatches.length - 1]);
    expect(navigation.navigate).toHaveBeenCalledWith(ADMIN_HOME_ROUTES.Orders);

    await fireEvent.press(screen.getByText('Reports'));
    expect(navigation.navigate).toHaveBeenCalledWith(ADMIN_HOME_ROUTES.Reports);

    await fireEvent.press(screen.getByText('Categories'));
    expect(navigation.navigate).toHaveBeenCalledWith(ADMIN_HOME_ROUTES.Categories);

    await fireEvent.press(screen.getByText('Reference Data'));
    expect(navigation.navigate).toHaveBeenCalledWith(ADMIN_HOME_ROUTES.ReferenceData);

    await fireEvent.press(screen.getByText('Audit Logs'));
    expect(navigation.navigate).toHaveBeenCalledWith(ADMIN_HOME_ROUTES.AuditLogs);

    await fireEvent.press(screen.getByText('Analytics'));
    expect(navigation.navigate).toHaveBeenCalledWith(ADMIN_HOME_ROUTES.Analytics);
  });
});
