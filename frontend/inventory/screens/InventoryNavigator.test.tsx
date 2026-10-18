import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider } from '../../common/components/Toast';
import type { Role } from '../../common/constants/roles';
import { AdminNavigator } from '../../navigation/stacks/AdminNavigator';
import { AppNavigator, type MarketRootParamList } from '../../navigation/stacks/AppNavigator';
import { ExpertNavigator } from '../../navigation/stacks/ExpertNavigator';
import { useAuthStore } from '../../state/authStore';
import { createTestQueryClient } from '../../testUtils/renderWithProviders';
import * as service from '../services/inventoryService';
import { answerReads, type MockedInventoryApi } from '../testUtils/api';
import { InventoryNavigator } from './InventoryNavigator';

// BR-03/04 and SRDS §15: the inventory system is for approved dealers only. The tile on the dealer dashboard opens it,
// no other role or account state ever sees the tile, and a navigation to the route by any other way meets a refusal,
// never a crash. The network edge is faked (each service), the navigators and screens are real.

jest.mock('../services/inventoryService');
jest.mock('../../hooks/realtime/useRealtimeNotifications', () => ({ useRealtimeNotifications: () => undefined }));
jest.mock('../../common/notifications/services/notificationsService', () => ({
  fetchUnreadCount: jest.fn().mockResolvedValue(0),
  fetchNotifications: jest.fn().mockResolvedValue([]),
  markRead: jest.fn(),
  markAllRead: jest.fn(),
}));
jest.mock('../../common/orders/services/ordersService', () => ({ fetchOrdersForUser: jest.fn().mockResolvedValue([]) }));
jest.mock('../../common/analytics/services/analyticsService', () => ({
  fetchFarmerAnalytics: jest.fn().mockResolvedValue({}),
  fetchDealerAnalytics: jest.fn().mockResolvedValue({}),
}));
jest.mock('../../common/auth/services/applicationService', () => ({
  ...jest.requireActual('../../common/auth/services/applicationService'),
  fetchDealerApplication: jest.fn().mockResolvedValue({ business_name: 'Ali Traders' }),
}));
// The other roles' dashboards are not what is under test; each only needs to render without its data.
jest.mock('../../farmer/screens/DashboardScreen', () => ({ FarmerDashboardScreen: () => null }));
jest.mock('../../buyer/screens/DashboardScreen', () => ({ BuyerDashboardScreen: () => null }));
jest.mock('../../expert/screens/DashboardScreen', () => ({ ExpertDashboardScreen: () => null }));
jest.mock('../../admin/screens/DashboardScreen', () => ({ AdminDashboardScreen: () => null }));

const api = service as MockedInventoryApi;
const PHONE = { frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 24, left: 0, right: 0, bottom: 24 } };

type AccountStatus = 'approved' | 'pending' | 'rejected';

async function signIn(role: Role, accountStatus: AccountStatus = 'approved', suspended = false) {
  await act(async () => {
    useAuthStore.setState({
      session: null,
      user: { id: `user-${role}` } as never,
      role,
      status: 'authenticated',
      profile: {
        id: `user-${role}`,
        role,
        full_name: 'Ali',
        account_status: accountStatus,
        is_suspended: suspended,
      } as never,
    });
  });
}

const navigationRef = createNavigationContainerRef<MarketRootParamList>();

async function renderTree(tree: React.ReactElement) {
  await render(
    <SafeAreaProvider initialMetrics={PHONE}>
      <ToastProvider>
        <QueryClientProvider client={createTestQueryClient()}>
          <NavigationContainer ref={navigationRef}>{tree}</NavigationContainer>
        </QueryClientProvider>
      </ToastProvider>
    </SafeAreaProvider>,
  );
}

function tabLabels(): string[] {
  return screen.getAllByRole('tab').map(tab => tab.props.accessibilityLabel as string);
}

beforeEach(() => {
  jest.clearAllMocks();
  answerReads(api);
});

describe('the approved dealer', () => {
  it('opens the inventory system from the dashboard tile and leaves it with "Back to ZaraiLink"', async () => {
    await signIn('dealer');
    await renderTree(<AppNavigator />);
    await fireEvent.press(await screen.findByText('Inventory Management'));

    // Its own app bar (the business name, the location switcher) and its own tabs, apart from the marketplace's.
    expect(await screen.findByText('Ali Traders')).toBeTruthy();
    expect(await screen.findByLabelText('Location: Main shop. Change location')).toBeTruthy();
    expect(tabLabels()).toEqual(['Dashboard', 'Products', 'Stock', 'Reports', 'More']);
    expect(await screen.findByLabelText('Products: 3')).toBeTruthy();

    await fireEvent.press(screen.getAllByRole('button', { name: 'Back to ZaraiLink' })[0]!);
    expect(await screen.findByText('Inventory Management')).toBeTruthy();
    expect(tabLabels()).toEqual(['Home', 'Market', 'Orders', 'Messages', 'Account']);
  });

  it('switches the location from the app bar', async () => {
    await signIn('dealer');
    await renderTree(<AppNavigator />);
    await fireEvent.press(await screen.findByText('Inventory Management'));
    await fireEvent.press(await screen.findByLabelText('Location: Main shop. Change location'));
    await fireEvent.press(within(screen.getByLabelText('Location')).getByText('Back godown'));
    expect(await screen.findByLabelText('Location: Back godown. Change location')).toBeTruthy();
  });

  it('a new dealer with no location is offered to add one from the app bar (not "Loading" for ever)', async () => {
    api.fetchLocations.mockResolvedValue([]);
    await signIn('dealer');
    await renderTree(<AppNavigator />);
    await fireEvent.press(await screen.findByText('Inventory Management'));
    await fireEvent.press(await screen.findByLabelText('Add a location'));
    expect(await screen.findByText('Default location')).toBeTruthy();
  });
});

describe('everyone else', () => {
  it.each(['farmer', 'buyer'] as const)('a %s has no tile, and the route does not exist in their shell', async role => {
    await signIn(role);
    await renderTree(<AppNavigator />);
    await screen.findAllByRole('tab');
    expect(screen.queryByText('Inventory Management')).toBeNull();
    expect(navigationRef.getRootState()?.routeNames).not.toContain('InventorySystem');
    // A navigation to it by name is simply not handled: the shell stays, nothing crashes, nothing loads.
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await act(async () => navigationRef.navigate('InventorySystem'));
    consoleError.mockRestore();
    expect(screen.getAllByRole('tab').length).toBeGreaterThan(0);
    expect(api.fetchDashboard).not.toHaveBeenCalled();
  });

  it('a dealer not approved has no tile even inside the dealer shell, and the route refuses them', async () => {
    // RootNavigator never mounts the dealer shell for a pending dealer (shells.test.tsx); this is the guard behind it.
    await signIn('dealer', 'pending');
    await renderTree(<AppNavigator />);
    await screen.findAllByRole('tab');
    expect(screen.queryByText('Inventory Management')).toBeNull();
    await act(async () => navigationRef.navigate('InventorySystem'));
    expect(await screen.findByText('Inventory Management is for approved dealers')).toBeTruthy();
    expect(api.fetchDashboard).not.toHaveBeenCalled();
  });

  it.each([
    ['expert', ExpertNavigator],
    ['admin', AdminNavigator],
  ] as const)('the %s’s own shell has no inventory route', async (role, Shell) => {
    await signIn(role);
    await renderTree(<Shell />);
    await screen.findAllByRole('tab');
    expect(screen.queryByText('Inventory Management')).toBeNull();
    expect(JSON.stringify(navigationRef.getRootState()?.routeNames)).not.toContain('Inventory');
  });

  it.each([
    ['a pending dealer', 'dealer', 'pending', false],
    ['a rejected dealer', 'dealer', 'rejected', false],
    ['a suspended dealer', 'dealer', 'approved', true],
    ['a farmer', 'farmer', 'approved', false],
    ['the admin', 'admin', 'approved', false],
  ] as const)('%s who reaches the inventory route meets a clear refusal, and no stock is read', async (_who, role, status, suspended) => {
    await signIn(role, status, suspended);
    const goBack = jest.fn();
    await renderTree(<InventoryNavigator navigation={{ goBack }} />);
    expect(await screen.findByText('Inventory Management is for approved dealers')).toBeTruthy();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    await fireEvent.press(screen.getByText('Back to ZaraiLink'));
    expect(goBack).toHaveBeenCalledTimes(1);
    expect(api.fetchDashboard).not.toHaveBeenCalled();
    expect(api.fetchLocations).not.toHaveBeenCalled();
  });

  it('a dealer whose approval is withdrawn while inside is shown the refusal at once', async () => {
    await signIn('dealer');
    await renderTree(<InventoryNavigator navigation={{ goBack: jest.fn() }} />);
    expect(await screen.findByLabelText('Products: 3')).toBeTruthy();
    await signIn('dealer', 'approved', true);
    expect(await screen.findByText('Inventory Management is for approved dealers')).toBeTruthy();
    expect(screen.queryByLabelText('Products: 3')).toBeNull();
  });
});
