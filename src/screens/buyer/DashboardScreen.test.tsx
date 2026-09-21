import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import '../../localization';
import { BuyerDashboardScreen } from './DashboardScreen';
import { fetchOrdersForUser } from '../../services/modules/orders/ordersService';
import { APP_TABS, CONSULTATIONS_ROUTES, MARKETPLACE_ROUTES, ORDERS_ROUTES } from '../../constants/routes';
import { useAuthStore } from '../../store/authStore';
import type { OrderWithItems } from '../../types/orders';

const mockTabNavigate = jest.fn();

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const { useEffect } = jest.requireActual('react');
  return {
    ...actual,
    // Runs once on mount instead of react-navigation's real focus/blur lifecycle — sufficient
    // for testing a screen's initial data load without a NavigationContainer.
    useFocusEffect: (effect: () => void) =>
      useEffect(() => {
        effect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []),
    useNavigation: () => ({
      getParent: () => ({ navigate: mockTabNavigate }),
    }),
  };
});

jest.mock('../../services/modules/orders/ordersService', () => ({
  fetchOrdersForUser: jest.fn(),
}));

const mockFetchOrders = fetchOrdersForUser as jest.Mock;

const order = (overrides: Partial<OrderWithItems> = {}): OrderWithItems =>
  ({
    id: 'order-1',
    status: 'pending',
    total: 500,
    seller: { id: 'seller-1', full_name: 'Green Farms' },
    ...overrides,
  }) as OrderWithItems;

beforeEach(() => {
  mockFetchOrders.mockReset();
  mockTabNavigate.mockReset();
  useAuthStore.setState({ user: { id: 'buyer-1' } as never });
});

describe('BuyerDashboardScreen', () => {
  it('shows purchase totals and the in-progress count once loaded', async () => {
    mockFetchOrders.mockResolvedValue([
      order({ status: 'pending' }),
      order({ id: 'order-2', status: 'completed' }),
    ]);
    await render(<BuyerDashboardScreen />);

    expect(await screen.findByText('Total Purchases')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('In Progress')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('lists recent purchases in the activity feed', async () => {
    mockFetchOrders.mockResolvedValue([order()]);
    await render(<BuyerDashboardScreen />);
    expect(await screen.findByText('Green Farms')).toBeTruthy();
    expect(screen.getByText('Rs. 500 · pending')).toBeTruthy();
  });

  it('shows an empty state when there are no purchases', async () => {
    mockFetchOrders.mockResolvedValue([]);
    await render(<BuyerDashboardScreen />);
    expect(await screen.findByText('No purchases yet')).toBeTruthy();
  });

  it('navigates into other tabs via Quick Actions', async () => {
    mockFetchOrders.mockResolvedValue([]);
    await render(<BuyerDashboardScreen />);
    await screen.findByText('Browse Marketplace');

    await fireEvent.press(screen.getByText('Browse Marketplace'));
    expect(mockTabNavigate).toHaveBeenCalledWith(APP_TABS.Marketplace, { screen: MARKETPLACE_ROUTES.Browse });

    await fireEvent.press(screen.getByText('Consult an Expert'));
    expect(mockTabNavigate).toHaveBeenCalledWith(APP_TABS.Consultations, {
      screen: CONSULTATIONS_ROUTES.ConsultationList,
    });
  });

  it('tapping a purchase navigates to its order detail', async () => {
    mockFetchOrders.mockResolvedValue([order()]);
    await render(<BuyerDashboardScreen />);
    await screen.findByText('Green Farms');
    await fireEvent.press(screen.getByTestId('activity-row-order-1'));
    expect(mockTabNavigate).toHaveBeenCalledWith(APP_TABS.Orders, {
      screen: ORDERS_ROUTES.OrderDetail,
      params: { orderId: 'order-1' },
    });
  });

  it('shows a retryable error state when loading fails', async () => {
    mockFetchOrders.mockRejectedValueOnce(new Error('offline'));
    await render(<BuyerDashboardScreen />);
    expect(await screen.findByText("Couldn't load your dashboard")).toBeTruthy();

    mockFetchOrders.mockResolvedValueOnce([]);
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('No purchases yet')).toBeTruthy();
  });
});
