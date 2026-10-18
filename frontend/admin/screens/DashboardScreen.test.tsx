import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { AdminDashboardScreen } from './DashboardScreen';
import { fetchAdminQueues, fetchPlatformStats, type PlatformStats } from '../services/adminService';
import { ADMIN_HOME_ROUTES, ADMIN_TABS } from '../../common/constants/routes';
import type { AdminQueues } from '../../services/api/generated/types.gen';
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
  fetchAdminQueues: jest.fn(),
}));

const mockFetchStats = fetchPlatformStats as jest.Mock;
const mockFetchQueues = fetchAdminQueues as jest.Mock;

const queues = (overrides: Partial<AdminQueues> = {}): AdminQueues => ({
  pending_dealer_applications: 2,
  pending_expert_applications: 1,
  open_reports: 4,
  disputed_orders: 5,
  stale_consultations: 0,
  ...overrides,
});

const stats = (overrides: Partial<PlatformStats> = {}): PlatformStats => ({
  totalUsers: 120,
  usersByRole: { farmer: 60, buyer: 30, dealer: 20, expert: 10 },
  totalListings: 55,
  totalOrders: 33,
  ...overrides,
});

// The queue tiles open other tabs through the parent tab navigator, so the stack's navigation has a parent.
const tabNavigate = jest.fn();

function makeNavigation() {
  return { navigate: jest.fn(), getParent: () => ({ navigate: tabNavigate }) } as unknown as AdminScreenProps<'Dashboard'>['navigation'];
}

beforeEach(() => {
  mockFetchStats.mockReset();
  mockFetchQueues.mockReset();
  mockFetchQueues.mockResolvedValue(queues());
  tabNavigate.mockReset();
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

  it('shows what waits for the admin, and each queue opens its own list (SRDS §14)', async () => {
    mockFetchStats.mockResolvedValue(stats());
    await renderWithQuery(<AdminDashboardScreen navigation={makeNavigation()} route={{} as never} />);

    // Dealer and expert applications are one queue.
    expect(await screen.findByLabelText('Applications: 3 waiting')).toBeTruthy();
    expect(screen.getByLabelText('Reports: 4 waiting')).toBeTruthy();
    expect(screen.getByLabelText('Disputes: 5 waiting')).toBeTruthy();
    expect(screen.getByLabelText('Stale consultations: 0 waiting')).toBeTruthy();
    expect(screen.getByText('Nothing waiting')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Applications: 3 waiting'));
    expect(tabNavigate).toHaveBeenLastCalledWith(ADMIN_TABS.Approvals, { screen: ADMIN_HOME_ROUTES.Approvals });
    await fireEvent.press(screen.getByLabelText('Reports: 4 waiting'));
    expect(tabNavigate).toHaveBeenLastCalledWith(ADMIN_TABS.Moderation, { screen: ADMIN_HOME_ROUTES.Reports, initial: false });
    await fireEvent.press(screen.getByLabelText('Disputes: 5 waiting'));
    expect(tabNavigate).toHaveBeenLastCalledWith(ADMIN_TABS.Moderation, {
      screen: ADMIN_HOME_ROUTES.Orders,
      params: { status: 'disputed' },
      initial: false,
    });
    await fireEvent.press(screen.getByLabelText('Stale consultations: 0 waiting'));
    expect(tabNavigate).toHaveBeenLastCalledWith(ADMIN_TABS.Moderation, {
      screen: ADMIN_HOME_ROUTES.ConsultationModeration,
      params: { stale: true },
      initial: false,
    });
  });

  it('keeps the totals when only the queues fail', async () => {
    mockFetchStats.mockResolvedValue(stats());
    mockFetchQueues.mockReset();
    mockFetchQueues.mockRejectedValue(new Error('offline'));
    await renderWithQuery(<AdminDashboardScreen navigation={makeNavigation()} route={{} as never} />);

    expect(await screen.findByText("Couldn't load the queues")).toBeTruthy();
    expect(screen.getByText('120')).toBeTruthy();
  });

  it('has no inventory entry: the admin has no access to dealer inventory (SRDS §15)', async () => {
    mockFetchStats.mockResolvedValue(stats());
    await renderWithQuery(<AdminDashboardScreen navigation={makeNavigation()} route={{} as never} />);
    await screen.findByText('120');

    expect(screen.queryByText(/inventory|stock/i)).toBeNull();
  });
});
