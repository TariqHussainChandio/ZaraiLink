import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { ADMIN_HOME_ROUTES, ADMIN_TABS, PROFILE_ROUTES } from '../../common/constants/routes';
import { useAuthStore } from '../../state/authStore';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { fetchAdminQueues } from '../services/adminService';
import { AdminMenu, AdminMenuButton } from './AdminMenu';

const mockTabsNavigate = jest.fn();
let mockRouteName: string = ADMIN_HOME_ROUTES.Dashboard;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ getParent: () => ({ navigate: mockTabsNavigate }) }),
  useRoute: () => ({ name: mockRouteName }),
}));
jest.mock('../services/adminService', () => ({ fetchAdminQueues: jest.fn() }));
const mockQueues = fetchAdminQueues as jest.Mock;

beforeEach(() => {
  mockTabsNavigate.mockReset();
  mockRouteName = ADMIN_HOME_ROUTES.Dashboard;
  mockQueues.mockReset().mockResolvedValue({
    pending_dealer_applications: 2,
    pending_expert_applications: 1,
    open_reports: 4,
    disputed_orders: 1,
    stale_consultations: 0,
  });
});

describe('AdminMenu (D19)', () => {
  it('opens from the menu button, which counts what is waiting', async () => {
    await renderWithQuery(<AdminMenuButton />);
    // 3 applications + 4 reports + 1 dispute.
    await fireEvent.press(await screen.findByRole('button', { name: 'Open the menu, 8 waiting' }));
    expect(screen.getByText('ZaraiLink admin')).toBeTruthy();
  });

  it('starts with the current screen’s group open and the others closed, each opening like a dropdown', async () => {
    await renderWithQuery(<AdminMenu onClose={() => {}} currentRoute={ADMIN_HOME_ROUTES.Dashboard} />);
    expect(screen.getByRole('menuitem', { name: 'Analytics' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Users' })).toBeNull();

    const group = screen.getByRole('button', { name: /^People and marketplace/ });
    expect(group.props.accessibilityState.expanded).toBe(false);
    await fireEvent.press(group);
    expect(screen.getByRole('button', { name: /^People and marketplace/ }).props.accessibilityState.expanded).toBe(true);
    expect(await screen.findByRole('menuitem', { name: 'Reports, 4 waiting' })).toBeTruthy();
  });

  it('lists every admin screen across its groups', async () => {
    await renderWithQuery(<AdminMenu onClose={() => {}} currentRoute={ADMIN_HOME_ROUTES.Dashboard} />);
    for (const title of ['Approvals', 'People and marketplace', 'Platform setup', 'Audit', 'Account']) {
      await fireEvent.press(screen.getByRole('button', { name: new RegExp(`^${title}`) }));
    }
    for (const label of [
      'Overview', 'Analytics', 'Notifications', 'Required documents', 'Users', 'Listings', 'Orders', 'Reviews',
      'Categories', 'Reference data', 'Disease knowledge', 'AI activity', 'Audit log', 'Change password',
    ]) {
      expect(screen.getByRole('menuitem', { name: label })).toBeTruthy();
    }
  });

  it('opens a screen in its own tab, closing itself first', async () => {
    const onClose = jest.fn();
    mockRouteName = ADMIN_HOME_ROUTES.AuditLogs;
    await renderWithQuery(<AdminMenu onClose={onClose} currentRoute={ADMIN_HOME_ROUTES.AuditLogs} />);
    await fireEvent.press(screen.getByRole('button', { name: /^People and marketplace/ }));
    await fireEvent.press(await screen.findByRole('menuitem', { name: /^Disputed orders/ }));
    expect(onClose).toHaveBeenCalled();
    expect(mockTabsNavigate).toHaveBeenCalledWith(ADMIN_TABS.Moderation, {
      screen: ADMIN_HOME_ROUTES.Orders,
      params: { status: 'disputed' },
      initial: false,
    });
  });

  it('marks the screen the admin is on', async () => {
    await renderWithQuery(<AdminMenu onClose={() => {}} currentRoute={ADMIN_HOME_ROUTES.AuditLogs} />);
    expect(screen.getByRole('menuitem', { name: 'Audit log' }).props.accessibilityState.selected).toBe(true);
  });

  it('changes the password and signs out from the Account group', async () => {
    const signOut = jest.fn();
    useAuthStore.setState({ signOut });
    await renderWithQuery(<AdminMenu onClose={() => {}} currentRoute={ADMIN_HOME_ROUTES.Dashboard} />);
    await fireEvent.press(screen.getByRole('button', { name: /^Account/ }));
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Change password' }));
    expect(mockTabsNavigate).toHaveBeenCalledWith(ADMIN_TABS.Profile, { screen: PROFILE_ROUTES.ChangePassword, params: undefined, initial: false });
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
