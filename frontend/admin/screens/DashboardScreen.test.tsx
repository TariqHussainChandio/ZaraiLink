import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { AdminDashboardScreen } from './DashboardScreen';
import { fetchAdminQueues, fetchPlatformStats, type PlatformStats } from '../services/adminService';
import { ADMIN_HOME_ROUTES, ADMIN_TABS } from '../../common/constants/routes';
import type { AdminScreenProps } from '../../navigation/stacks/AdminNavigator';
import type { AdminQueues } from '../../services/api/generated/types.gen';
import { useAuthStore } from '../../state/authStore';

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
  pending_dealer_applications: 3,
  pending_expert_applications: 1,
  open_reports: 2,
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
  mockFetchQueues.mockReset().mockResolvedValue(queues());
});

describe('AdminDashboardScreen', () => {
  it('greets nobody in the body: the admin’s name is in the app bar (D20)', async () => {
    useAuthStore.setState({ profile: { full_name: 'Sana Iqbal' } as never });
    const { navigation } = makeNavigation();
    await renderScreen(navigation);
    expect(await screen.findByText('Needs you')).toBeTruthy();
    expect(screen.queryByText(/^Hello/)).toBeNull();
    useAuthStore.setState({ profile: null });
  });

  it('leads with what needs the admin, counted by the server (SRDS §14, AD-14)', async () => {
    const { navigation } = makeNavigation();
    await renderScreen(navigation);

    expect(await screen.findByText('Needs you')).toBeTruthy();
    // 3 dealers and 1 expert are one queue.
    expect(await screen.findByLabelText('Applications waiting: 4 waiting')).toBeTruthy();
    expect(screen.getByLabelText('Open reports: 2 open')).toBeTruthy();
    expect(screen.getByLabelText('Disputed orders: 5 disputed')).toBeTruthy();
    expect(screen.getByLabelText('Consultations left open: none left open')).toBeTruthy();
  });

  it('shows "—", not 0, when the queues could not be loaded, and keeps the totals', async () => {
    mockFetchQueues.mockRejectedValue(new Error('boom'));
    const { navigation } = makeNavigation();
    await renderScreen(navigation);

    expect(await screen.findByLabelText('Open reports: not available')).toBeTruthy();
    expect(screen.queryByLabelText('Open reports: none open')).toBeNull();
    expect(await screen.findByText('120')).toBeTruthy();
  });

  it('opens each queue in its own tab, keeping the tab root underneath', async () => {
    const { navigation, tabs } = makeNavigation();
    await renderScreen(navigation);

    await fireEvent.press(await screen.findByLabelText('Applications waiting: 4 waiting'));
    expect(tabs.navigate).toHaveBeenLastCalledWith(ADMIN_TABS.Approvals, { screen: ADMIN_HOME_ROUTES.Approvals, params: undefined, initial: false });

    await fireEvent.press(screen.getByLabelText('Open reports: 2 open'));
    expect(tabs.navigate).toHaveBeenLastCalledWith(ADMIN_TABS.Moderation, { screen: ADMIN_HOME_ROUTES.Reports, params: undefined, initial: false });

    await fireEvent.press(screen.getByLabelText('Disputed orders: 5 disputed'));
    expect(tabs.navigate).toHaveBeenLastCalledWith(ADMIN_TABS.Moderation, {
      screen: ADMIN_HOME_ROUTES.Orders,
      params: { status: 'disputed' },
      initial: false,
    });

    await fireEvent.press(screen.getByLabelText('Consultations left open: none left open'));
    expect(tabs.navigate).toHaveBeenLastCalledWith(ADMIN_TABS.Moderation, {
      screen: ADMIN_HOME_ROUTES.ConsultationModeration,
      params: { stale: true },
      initial: false,
    });
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

  it('leaves analytics, AI activity and disease knowledge to the menu, and notifications to the bell (D20)', async () => {
    const { navigation } = makeNavigation();
    await renderScreen(navigation);
    await screen.findByText('120');

    for (const label of ['Analytics', 'AI activity', 'Disease knowledge', 'Notifications', 'Manage Users']) {
      expect(screen.queryByRole('button', { name: label })).toBeNull();
    }
  });

  it('opens Users filtered to a role from that role tile (D20)', async () => {
    const { navigation, tabs } = makeNavigation();
    await renderScreen(navigation);
    await fireEvent.press(await screen.findByRole('button', { name: /^Farmer/ }));
    expect(tabs.navigate).toHaveBeenCalledWith(ADMIN_TABS.Moderation, {
      screen: ADMIN_HOME_ROUTES.UserManagement,
      params: { role: 'farmer' },
      initial: false,
    });
  });

  it('has no inventory entry: the admin has no access to dealer inventory (SRDS §15)', async () => {
    const { navigation } = makeNavigation();
    await renderScreen(navigation);
    await screen.findByText('120');

    expect(screen.queryByText(/inventory|stock/i)).toBeNull();
  });
});
