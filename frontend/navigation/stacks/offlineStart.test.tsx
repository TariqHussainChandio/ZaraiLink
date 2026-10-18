import { NavigationContainer } from '@react-navigation/native';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider } from '../../common/components/Toast';
import { supabase as client } from '../../services/supabase/client';
import { useAuthStore } from '../../state/authStore';
import { useNetworkStore } from '../../state/networkStore';
import { rememberProfile } from '../../state/rememberedProfile';
import { createTestQueryClient } from '../../testUtils/renderWithProviders';
import type { makeSupabaseMock } from '../../testUtils/supabaseMock';
import { RootNavigator } from './RootNavigator';

// B4 verification, F1: an approved dealer who started the app offline landed in the buyer shell, without the inventory
// system, and stayed there after reconnecting. Here the real auth store starts against a Supabase client that gets no
// response (postgrest-js answers status 0), and the real root navigator decides the shell. The edge is faked: Supabase,
// the dashboard reads and the notification bell; the inventory reads never answer (this is about reaching the system, its
// screens are tested in frontend/inventory).
jest.mock('../../services/supabase/client', () => {
  const { makeSupabaseMock: create } = jest.requireActual('../../testUtils/supabaseMock');
  return { supabase: create() };
});
// Every inventory read stays pending: the screens show their loading state, which is enough to prove the system opened.
jest.mock('../../inventory/services/inventoryService', () =>
  new Proxy({}, { get: (_target, name) => (name === '__esModule' ? true : jest.fn(() => new Promise(() => undefined))) }),
);
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
jest.mock('../../farmer/screens/DashboardScreen', () => ({ FarmerDashboardScreen: () => null }));
jest.mock('../../buyer/screens/DashboardScreen', () => ({ BuyerDashboardScreen: () => null }));

const supabase = client as unknown as ReturnType<typeof makeSupabaseMock>;

const PHONE = { frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 24, left: 0, right: 0, bottom: 24 } };

function account(id: string, role: string, extra: Record<string, unknown> = {}) {
  return { id, role, full_name: 'Ali', account_status: 'approved', is_suspended: false, ...extra };
}

function answerProfile(answer: { data: unknown; error: unknown; status: number }) {
  supabase.from.mockImplementation((() => {
    const builder: Record<string, unknown> = {};
    builder.select = jest.fn(() => builder);
    builder.eq = jest.fn(() => builder);
    builder.single = jest.fn(() => Promise.resolve(answer));
    return builder;
  }) as never);
}
const noResponse = () =>
  answerProfile({ data: null, error: { message: 'TypeError: Network request failed', code: '' }, status: 0 });

let unsubscribe: (() => void) | undefined;

async function coldStartOffline(userId: string) {
  supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: 't', user: { id: userId } } }, error: null } as never);
  noResponse();
  await act(async () => {
    useNetworkStore.setState({ isOffline: true });
    unsubscribe = useAuthStore.getState().initialize();
  });
  await render(
    <SafeAreaProvider initialMetrics={PHONE}>
      <ToastProvider>
        <QueryClientProvider client={createTestQueryClient()}>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
        </QueryClientProvider>
      </ToastProvider>
    </SafeAreaProvider>,
  );
}

function tabLabels(): string[] {
  return screen.getAllByRole('tab').map(tab => tab.props.accessibilityLabel as string);
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  await act(async () => {
    useAuthStore.setState({
      session: null,
      user: null,
      profile: null,
      role: null,
      status: 'loading',
      unavailableReason: null,
      deviceAccount: null,
    });
    useNetworkStore.setState({ isOffline: false });
  });
});

afterEach(() => {
  unsubscribe?.();
  unsubscribe = undefined;
});

describe('an offline cold start', () => {
  it('opens a remembered approved dealer in the dealer shell, and the inventory system opens', async () => {
    await rememberProfile(account('dealer-a', 'dealer') as never);
    await coldStartOffline('dealer-a');

    await fireEvent.press(await screen.findByText('Inventory Management'));
    expect(screen.queryByText('Inventory Management is for approved dealers')).toBeNull();
    expect(tabLabels()).toEqual(['Dashboard', 'Products', 'Stock', 'Reports', 'More']);
  });

  it('gives the dealer shell its own tabs and the marketplace listings their own name', async () => {
    await rememberProfile(account('dealer-a', 'dealer') as never);
    await coldStartOffline('dealer-a');

    expect(await screen.findByText('Inventory Management')).toBeTruthy();
    expect(tabLabels()).toEqual(['Home', 'Market', 'Orders', 'Messages', 'Account']);
    expect(screen.getByText('My Listings')).toBeTruthy();
    expect(screen.queryByText('Products')).toBeNull();
  });

  it('opens a remembered farmer in the farmer shell', async () => {
    await rememberProfile(account('farmer-a', 'farmer') as never);
    await coldStartOffline('farmer-a');

    await screen.findAllByRole('tab');
    expect(tabLabels()).toEqual(['Home', 'Market', 'Orders', 'Advisory', 'Account']);
  });

  it('says the account cannot be checked when nothing is remembered, and opens no shell', async () => {
    await coldStartOffline('dealer-a');

    expect(await screen.findByRole('header', { name: "We can't check your account while you're offline" })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });

  it('opens the right shell from Retry once the server answers', async () => {
    await coldStartOffline('dealer-a');
    await screen.findByRole('header', { name: "We can't check your account while you're offline" });

    answerProfile({ data: account('dealer-a', 'dealer'), error: null, status: 200 });
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Inventory Management')).toBeTruthy();
    expect(tabLabels()).toEqual(['Home', 'Market', 'Orders', 'Messages', 'Account']);
  });

  it('follows the server on reconnect: a dealer suspended meanwhile sees Suspended', async () => {
    await rememberProfile(account('dealer-a', 'dealer') as never);
    await coldStartOffline('dealer-a');
    await screen.findByText('Inventory Management');

    answerProfile({ data: account('dealer-a', 'dealer', { is_suspended: true }), error: null, status: 200 });
    await act(async () => {
      useNetworkStore.setState({ isOffline: false });
    });
    expect(await screen.findByRole('header', { name: 'Account Suspended' })).toBeTruthy();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });
});
