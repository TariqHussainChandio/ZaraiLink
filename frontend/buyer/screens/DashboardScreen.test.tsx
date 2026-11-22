import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { BuyerDashboardScreen } from './DashboardScreen';
import { fetchOrdersForUser } from '../../common/orders/services/ordersService';
import { APP_TABS, ORDERS_ROUTES } from '../../common/constants/routes';
import { useAuthStore } from '../../state/authStore';
import type { OrderWithItems } from '../../common/orders/types/orders';

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

jest.mock('../../common/orders/services/ordersService', () => ({
  fetchOrdersForUser: jest.fn(),
}));

const mockFetchOrders = fetchOrdersForUser as jest.Mock;

const order = (overrides: Partial<OrderWithItems> = {}): OrderWithItems =>
  ({
    id: 'order-1',
    status: 'completed',
    total: 500,
    seller: { id: 'seller-1', full_name: 'Green Farms' },
    order_items: [{ id: 'i1', listing: { title: 'Urea 50 kg', unit: 'bag' } }],
    ...overrides,
  }) as OrderWithItems;

beforeEach(() => {
  mockFetchOrders.mockReset();
  mockTabNavigate.mockReset();
  useAuthStore.setState({ user: { id: 'buyer-1' } as never });
});

describe('BuyerDashboardScreen', () => {
  it('leads with what is waiting for payment and lists it under Needs you', async () => {
    mockFetchOrders.mockResolvedValue([order({ id: 'o1', status: 'confirmed' }), order({ id: 'o2' })]);
    await renderWithQuery(<BuyerDashboardScreen />);

    // D20: no status headline; the alert rows say what is waiting.
    expect(await screen.findByText('Needs you')).toBeTruthy();
    expect(screen.queryByText('1 order waiting for payment')).toBeNull();
    expect(screen.getByText('Open the order to pay')).toBeTruthy();
  });

  it('asks the buyer to confirm dispatched orders', async () => {
    mockFetchOrders.mockResolvedValue([order({ status: 'dispatched' })]);
    await renderWithQuery(<BuyerDashboardScreen />);
    expect(await screen.findByText('Confirm when the goods arrive')).toBeTruthy();
  });

  it('shows status through a badge on each recent purchase, not as plain text', async () => {
    mockFetchOrders.mockResolvedValue([order()]);
    await renderWithQuery(<BuyerDashboardScreen />);
    expect(await screen.findByText('Green Farms')).toBeTruthy();
    expect(screen.queryByText("You're up to date")).toBeNull();
    expect(screen.getByText('Urea 50 kg')).toBeTruthy();
    expect(screen.getByText('Completed')).toBeTruthy();
    expect(screen.queryByText(/Rs 500 ·/)).toBeNull();
  });

  it('shows an empty note and no "find products" card when nothing is waiting (D20: the market is its own tab)', async () => {
    mockFetchOrders.mockResolvedValue([]);
    await renderWithQuery(<BuyerDashboardScreen />);
    expect(await screen.findByText(/No purchases yet/)).toBeTruthy();
    expect(screen.queryByText('Find seeds and fertiliser')).toBeNull();
    expect(screen.queryByRole('button', { name: /Find/ })).toBeNull();
  });

  it('tapping a purchase opens its order with the Orders tab root kept underneath', async () => {
    mockFetchOrders.mockResolvedValue([order()]);
    await renderWithQuery(<BuyerDashboardScreen />);
    await fireEvent.press(await screen.findByText('Green Farms'));
    expect(mockTabNavigate).toHaveBeenCalledWith(APP_TABS.Orders, {
      screen: ORDERS_ROUTES.OrderDetail,
      params: { orderId: 'order-1' },
      initial: false,
    });
  });

  it('keeps the screen and shows unknown figures as a dash when loading fails, then recovers', async () => {
    mockFetchOrders.mockRejectedValueOnce(new Error('offline'));
    await renderWithQuery(<BuyerDashboardScreen />);
    expect(await screen.findByText("Couldn't load your orders")).toBeTruthy();
    // The rest of the screen is still there; the figures are unknown, never 0.
    expect(screen.getAllByText('—')).toHaveLength(2);
    expect(screen.getByText('Recent purchases')).toBeTruthy();

    mockFetchOrders.mockResolvedValueOnce([]);
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText(/No purchases yet/)).toBeTruthy();
    expect(screen.queryByText("Couldn't load your orders")).toBeNull();
  });
});
