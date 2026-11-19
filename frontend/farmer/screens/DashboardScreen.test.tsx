import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FarmerDashboardScreen } from './DashboardScreen';
import { createTestQueryClient, renderWithProviders } from '../../testUtils/renderWithProviders';
import { stackScreenOptions } from '../../navigation/stackHeader';
import { useAuthStore } from '../../state/authStore';
import { fetchOrdersForUser } from '../../common/orders/services/ordersService';
import { fetchFarmerAnalytics } from '../../common/analytics/services/analyticsService';

jest.mock('../../common/orders/services/ordersService', () => ({ fetchOrdersForUser: jest.fn() }));
jest.mock('../../common/analytics/services/analyticsService', () => ({
  fetchFarmerAnalytics: jest.fn(),
  fetchDealerAnalytics: jest.fn(),
}));

beforeEach(() => {
  (fetchOrdersForUser as jest.Mock).mockResolvedValue([]);
  (fetchFarmerAnalytics as jest.Mock).mockResolvedValue({
    activeListings: 3,
    pendingOrders: 1,
    readyToDispatch: 0,
    farmCount: 2,
    cropCount: 5,
    openConsultations: 4,
    resolvedConsultations: 6,
  });
  useAuthStore.setState({ user: { id: 'u1' } as never, role: 'farmer' as never });
});

describe('FarmerDashboardScreen', () => {
  it('renders the shared SellerDashboard with the farmer stats', async () => {
    await renderWithProviders(<FarmerDashboardScreen />);

    expect(await screen.findByText('Active Listings')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('Farms')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('Farms & Crops')).toBeTruthy();
    expect(screen.getByText('Scan Disease')).toBeTruthy();
  });

  it("titles the large app bar with a greeting heading by the farmer's name (A8, F1)", async () => {
    useAuthStore.setState({ profile: { full_name: 'Ali Raza' } as never });
    const Stack = createNativeStackNavigator();
    // The app's own stack header, as HomeNavigator draws it: the dashboard is the tab root, so its title is large.
    await render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 24, left: 0, right: 0, bottom: 24 } }}>
        <QueryClientProvider client={createTestQueryClient()}>
          <NavigationContainer>
            <Stack.Navigator screenOptions={stackScreenOptions}>
              <Stack.Screen name="Dashboard" component={FarmerDashboardScreen} options={{ title: 'Home' }} />
            </Stack.Navigator>
          </NavigationContainer>
        </QueryClientProvider>
      </SafeAreaProvider>,
    );

    expect(await screen.findByRole('header', { name: /^Good (morning|afternoon|evening), Ali Raza$/ })).toBeTruthy();
    expect(screen.queryByRole('header', { name: 'Home' })).toBeNull();
    useAuthStore.setState({ profile: null });
  });
});
