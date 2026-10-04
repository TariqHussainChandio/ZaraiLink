import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, within } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthStore } from '../../state/authStore';
import { createTestQueryClient } from '../../testUtils/renderWithProviders';
import { lightColors } from '../../theme';
import { AdminNavigator } from './AdminNavigator';
import { AppNavigator } from './AppNavigator';
import { ExpertNavigator } from './ExpertNavigator';

// The role shells as a user meets them (A2): each role's tabs in order, its accent on the selected tab, and the app-bar
// actions on the first screen shown exactly once. A second copy of an action is the signature of the double mount that
// crashed the app (an action passed as React Navigation's header-right also mounts in the hidden native header), so
// the counts guard stackOptionsWithActions. The dashboards are stubbed: this is about the shell, not their data. The
// network edge is faked: the notifications service answers 3 unread and the realtime subscription opens no socket
// (useRealtimeNotifications.test.tsx covers it on the real client).
jest.mock('../HomeDashboardScreen', () => ({ HomeDashboardScreen: () => null }));
jest.mock('../../expert/screens/DashboardScreen', () => ({ ExpertDashboardScreen: () => null }));
jest.mock('../../admin/screens/DashboardScreen', () => ({ AdminDashboardScreen: () => null }));
jest.mock('../../hooks/realtime/useRealtimeNotifications', () => ({ useRealtimeNotifications: () => undefined }));
jest.mock('../../common/notifications/services/notificationsService', () => ({
  fetchUnreadCount: jest.fn().mockResolvedValue(3),
  fetchNotifications: jest.fn().mockResolvedValue([]),
  markRead: jest.fn(),
  markAllRead: jest.fn(),
}));

const PHONE = { frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 24, left: 0, right: 0, bottom: 24 } };

async function renderShell(role: 'farmer' | 'buyer' | 'dealer' | 'expert' | 'admin') {
  useAuthStore.setState({ role, user: { id: `user-${role}` } as never });
  const shell = role === 'expert' ? <ExpertNavigator /> : role === 'admin' ? <AdminNavigator /> : <AppNavigator />;
  await render(
    <SafeAreaProvider initialMetrics={PHONE}>
      <QueryClientProvider client={createTestQueryClient()}>
        <NavigationContainer>{shell}</NavigationContainer>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  await screen.findByRole('button', { name: 'Notifications, 3 unread' });
}

function tabLabels(): string[] {
  return screen.getAllByRole('tab').map(tab => tab.props.accessibilityLabel as string);
}

describe('role shells', () => {
  it.each([
    ['farmer', ['Home', 'Market', 'Orders', 'Advisory', 'Account']],
    ['buyer', ['Home', 'Market', 'Orders', 'Experts', 'Account']],
    ['dealer', ['Home', 'Market', 'Orders', 'Messages', 'Account']],
    ['expert', ['Requests', 'Cases', 'Messages', 'Account']],
    ['admin', ['Overview', 'Approvals', 'Moderation', 'Audit', 'Account']],
  ] as const)('gives the %s their own tabs, the first selected, in their accent', async (role, tabs) => {
    await renderShell(role);
    expect(tabLabels()).toEqual(tabs);
    const first = screen.getByRole('tab', { name: tabs[0] });
    expect(first).toBeSelected();
    expect(StyleSheet.flatten(within(first).getByText(tabs[0]).props.style).color).toBe(lightColors.accent[role].ink);
  });

  it.each(['farmer', 'buyer'] as const)('puts Messages and the bell in the %s Home app bar, once each', async role => {
    await renderShell(role);
    expect(screen.getAllByRole('button', { name: 'Messages' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Notifications, 3 unread' })).toHaveLength(1);
  });

  it.each(['dealer', 'expert', 'admin'] as const)('puts only the bell in the %s first app bar, once', async role => {
    await renderShell(role);
    expect(screen.queryByRole('button', { name: 'Messages' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Notifications, 3 unread' })).toHaveLength(1);
  });
});

// A3a (D10): the root routes a dealer or expert waiting for a decision to their application status only, before any
// role shell, and one approved while signed in to the screen that asks them to sign in again.
jest.mock('../../common/auth/screens/ApplicationStatusScreen', () => {
  const { Text } = jest.requireActual('react-native');
  return { ApplicationStatusScreen: () => <Text>Application status</Text> };
});

describe('root routing for an account waiting for a decision', () => {
  // Required lazily so the mocks above apply to the root navigator's imports.
  const { RootNavigator } = jest.requireActual('./RootNavigator') as typeof import('./RootNavigator');

  async function renderRoot() {
    await render(
      <SafeAreaProvider initialMetrics={PHONE}>
        <QueryClientProvider client={createTestQueryClient()}>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
  }

  it.each(['dealer', 'expert'] as const)('shows a waiting %s their application, with no tabs', async role => {
    useAuthStore.setState({ role, status: 'awaitingApproval', user: { id: `user-${role}` } as never });
    await renderRoot();
    expect(await screen.findByText('Application status')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Your application' })).toBeTruthy();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });

  it('asks an approved dealer to sign in again before any shell mounts', async () => {
    useAuthStore.setState({ role: 'dealer', status: 'approvalGranted', user: { id: 'user-dealer' } as never });
    await renderRoot();
    expect(screen.getByText('Your account is approved')).toBeTruthy();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });
});

describe('root routing for an admin with an authenticator (A3a verification round 1, H1)', () => {
  const { RootNavigator } = jest.requireActual('./RootNavigator') as typeof import('./RootNavigator');

  it('asks for the second factor before the admin console mounts', async () => {
    useAuthStore.setState({ role: 'admin', status: 'secondFactor', user: { id: 'user-admin' } as never });
    await render(
      <SafeAreaProvider initialMetrics={PHONE}>
        <QueryClientProvider client={createTestQueryClient()}>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
    expect(screen.getByRole('header', { name: 'Two-step verification' })).toBeTruthy();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });
});
