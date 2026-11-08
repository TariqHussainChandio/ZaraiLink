import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { AdminDashboardScreen } from './DashboardScreen';
import { fetchDealerApplications, fetchPlatformStats, fetchReportsPage, type PlatformStats } from '../services/adminService';
import { fetchExpertsForAdmin } from '../../expert/services/expertService';
import { ADMIN_HOME_ROUTES, ADMIN_TABS } from '../../common/constants/routes';
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
  fetchDealerApplications: jest.fn(),
  fetchReportsPage: jest.fn(),
}));
jest.mock('../../expert/services/expertService', () => ({ fetchExpertsForAdmin: jest.fn() }));

const mockFetchStats = fetchPlatformStats as jest.Mock;
const mockFetchDealers = fetchDealerApplications as jest.Mock;
const mockFetchExperts = fetchExpertsForAdmin as jest.Mock;
const mockFetchReports = fetchReportsPage as jest.Mock;

const stats = (overrides: Partial<PlatformStats> = {}): PlatformStats => ({
  totalUsers: 120,
  usersByRole: { farmer: 60, buyer: 30, dealer: 20, expert: 10 },
  totalListings: 55,
  totalOrders: 33,
  ...overrides,
});

function makeNavigation() {
  const tabs = { navigate: jest.fn() };
  const navigation = { navigate: jest.fn(), getParent: () => tabs } as unknown as AdminScreenProps<'Dashboard'>['navigation'];
  return { navigation, tabs };
}

async function renderScreen(navigation: AdminScreenProps<'Dashboard'>['navigation']) {
  return renderWithQuery(<AdminDashboardScreen navigation={navigation} route={{} as never} />);
}

beforeEach(() => {
  mockFetchStats.mockReset().mockResolvedValue(stats());
  mockFetchDealers.mockReset().mockResolvedValue([{ id: 'd1' }, { id: 'd2' }, { id: 'd3' }]);
  mockFetchExperts.mockReset().mockResolvedValue([{ id: 'e1' }]);
  mockFetchReports.mockReset().mockResolvedValue({ data: [{ id: 'r1' }, { id: 'r2' }], next: null });
});

describe('AdminDashboardScreen', () => {
  it('leads with what needs the admin: applications waiting and open reports (AD-14)', async () => {
    const { navigation } = makeNavigation();
    await renderScreen(navigation);

    expect(await screen.findByText('Needs you')).toBeTruthy();
    // 3 dealers and 1 expert waiting; 2 reports open.
    expect(await screen.findByLabelText('Applications waiting: 4 waiting')).toBeTruthy();
    expect(screen.getByLabelText('Open reports: 2 open')).toBeTruthy();
  });

  it('shows "—", not 0, for a figure that could not be loaded', async () => {
    mockFetchReports.mockRejectedValue(new Error('boom'));
    const { navigation } = makeNavigation();
    await renderScreen(navigation);

    expect(await screen.findByLabelText('Open reports: not available')).toBeTruthy();
    expect(screen.queryByLabelText('Open reports: none open')).toBeNull();
  });

  it('says when a count has more behind it', async () => {
    mockFetchReports.mockResolvedValue({ data: Array.from({ length: 50 }, (_, i) => ({ id: `r${i}` })), next: { limit: 50, offset: 50 } });
    const { navigation } = makeNavigation();
    await renderScreen(navigation);

    expect(await screen.findByLabelText('Open reports: 50+ open')).toBeTruthy();
  });

  it('opens Approvals and Reports in their own tabs, keeping the tab root underneath', async () => {
    const { navigation, tabs } = makeNavigation();
    await renderScreen(navigation);

    await fireEvent.press(await screen.findByLabelText('Applications waiting: 4 waiting'));
    expect(tabs.navigate).toHaveBeenCalledWith(ADMIN_TABS.Approvals, { screen: ADMIN_HOME_ROUTES.Approvals, params: undefined, initial: false });

    await fireEvent.press(screen.getByLabelText('Open reports: 2 open'));
    expect(tabs.navigate).toHaveBeenCalledWith(ADMIN_TABS.Moderation, { screen: ADMIN_HOME_ROUTES.Reports, params: undefined, initial: false });
  });

  it('loads and renders the platform totals, each opening where it comes from', async () => {
    const { navigation, tabs } = makeNavigation();
    await renderScreen(navigation);

    expect(await screen.findByText('120')).toBeTruthy();
    expect(screen.getByText('55')).toBeTruthy();
    expect(screen.getByText('33')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Users: 120'));
    expect(tabs.navigate).toHaveBeenCalledWith(ADMIN_TABS.Moderation, { screen: ADMIN_HOME_ROUTES.UserManagement, params: undefined, initial: false });
  });

  it('shows a breakdown of users by role', async () => {
    const { navigation } = makeNavigation();
    await renderScreen(navigation);

    await screen.findByText('120');
    expect(screen.getByText('Farmer')).toBeTruthy();
    expect(screen.getByText('60')).toBeTruthy();
    expect(screen.getByText('Buyer')).toBeTruthy();
    expect(screen.getByText('Dealer')).toBeTruthy();
    expect(screen.getByText('Expert')).toBeTruthy();
  });

  it('shows a retry state for the figures when loading fails, and keeps "Needs you"', async () => {
    mockFetchStats.mockRejectedValueOnce(new Error('offline'));
    const { navigation } = makeNavigation();
    await renderScreen(navigation);

    expect(await screen.findByText("Couldn't load the platform figures")).toBeTruthy();
    expect(screen.getByText('Needs you')).toBeTruthy();

    mockFetchStats.mockResolvedValueOnce(stats());
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('120')).toBeTruthy();
  });

  it('links to analytics; notifications are the bell, not a second button', async () => {
    const { navigation } = makeNavigation();
    await renderScreen(navigation);
    await screen.findByText('120');

    await fireEvent.press(screen.getByText('See analytics'));
    expect(navigation.navigate).toHaveBeenCalledWith(ADMIN_HOME_ROUTES.Analytics);

    expect(screen.queryByText('Notifications')).toBeNull();
    expect(screen.queryByText('Manage Users')).toBeNull();
  });
});
