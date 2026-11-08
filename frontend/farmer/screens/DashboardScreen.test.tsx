import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { FarmerDashboardScreen } from './DashboardScreen';
import { useAuthStore } from '../../state/authStore';
import { fetchFarmerAnalytics } from '../../common/analytics/services/analyticsService';
import { APP_TABS, CONSULTATIONS_ROUTES, HOME_ROUTES, MARKETPLACE_ROUTES, ORDERS_ROUTES } from '../../common/constants/routes';

const mockTabNavigate = jest.fn();
const mockStackNavigate = jest.fn();

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
    useNavigation: () => ({ navigate: mockStackNavigate, getParent: () => ({ navigate: mockTabNavigate }) }),
  };
});

jest.mock('../../common/analytics/services/analyticsService', () => ({
  fetchFarmerAnalytics: jest.fn(),
  fetchDealerAnalytics: jest.fn(),
}));

const mockFetch = fetchFarmerAnalytics as jest.Mock;

const stats = {
  totalListingViews: 42,
  activeListings: 3,
  pendingOrders: 1,
  readyToDispatch: 2,
  totalOrders: 6,
  totalSales: 48200,
  popularProducts: [],
  farmCount: 2,
  cropCount: 5,
  openConsultations: 0,
  resolvedConsultations: 6,
};

beforeEach(() => {
  mockFetch.mockReset();
  mockTabNavigate.mockReset();
  mockStackNavigate.mockReset();
  useAuthStore.setState({ user: { id: 'u1' } as never, role: 'farmer' as never });
});

describe('FarmerDashboardScreen', () => {
  it('leads with the crop-health card, then what needs the farmer', async () => {
    mockFetch.mockResolvedValue(stats);
    await renderWithQuery(<FarmerDashboardScreen />);

    expect(await screen.findByText('2 things need you')).toBeTruthy();
    expect(screen.getByText('Is a crop sick?')).toBeTruthy();
    expect(screen.getByText('Photograph a leaf for advice')).toBeTruthy();
    expect(screen.getByText('Needs you')).toBeTruthy();
    expect(screen.getByText('2 orders ready to dispatch')).toBeTruthy();
    expect(screen.getByText('1 new order to confirm')).toBeTruthy();
    // No consultation is open, so no row says so.
    expect(screen.queryByText(/open consultation/)).toBeNull();
  });

  it('opens the scan in the Home tab with the dashboard kept underneath', async () => {
    mockFetch.mockResolvedValue(stats);
    await renderWithQuery(<FarmerDashboardScreen />);

    await fireEvent.press(await screen.findByText('Take photo'));
    expect(mockTabNavigate).toHaveBeenCalledWith(APP_TABS.Home, { screen: HOME_ROUTES.DiseaseAdvisory, params: undefined, initial: false });
  });

  it('sends the farmer to the orders and the new listing through their tabs', async () => {
    mockFetch.mockResolvedValue(stats);
    await renderWithQuery(<FarmerDashboardScreen />);

    await fireEvent.press(await screen.findByText('2 orders ready to dispatch'));
    expect(mockTabNavigate).toHaveBeenCalledWith(APP_TABS.Orders, { screen: ORDERS_ROUTES.OrderHistory, params: undefined, initial: false });

    await fireEvent.press(screen.getByText('Sell produce'));
    expect(mockTabNavigate).toHaveBeenCalledWith(APP_TABS.Marketplace, { screen: MARKETPLACE_ROUTES.CreateListing, params: undefined, initial: false });
  });

  it('opens consultations when one is open', async () => {
    mockFetch.mockResolvedValue({ ...stats, openConsultations: 1 });
    await renderWithQuery(<FarmerDashboardScreen />);

    await fireEvent.press(await screen.findByText('1 open consultation'));
    expect(mockTabNavigate).toHaveBeenCalledWith(APP_TABS.Consultations, {
      screen: CONSULTATIONS_ROUTES.ConsultationList,
      params: undefined,
      initial: false,
    });
  });

  it('shows the sales and order figures as tappable tiles and the three places to go', async () => {
    mockFetch.mockResolvedValue(stats);
    await renderWithQuery(<FarmerDashboardScreen />);

    expect(await screen.findByText('Rs 48,200')).toBeTruthy();
    await fireEvent.press(screen.getByText('Rs 48,200'));
    expect(mockStackNavigate).toHaveBeenCalledWith(HOME_ROUTES.Analytics);

    expect(screen.getByText('2 farms, 5 crops')).toBeTruthy();
    await fireEvent.press(screen.getByText('Farms and crops'));
    expect(mockStackNavigate).toHaveBeenCalledWith(HOME_ROUTES.FarmList);

    expect(screen.getByText('3 active')).toBeTruthy();
    await fireEvent.press(screen.getByText('My listings'));
    expect(mockStackNavigate).toHaveBeenCalledWith(HOME_ROUTES.MyListings);

    await fireEvent.press(screen.getByText('Analytics'));
    expect(mockStackNavigate).toHaveBeenCalledWith(HOME_ROUTES.Analytics);
  });

  it('says it is up to date when nothing is waiting', async () => {
    mockFetch.mockResolvedValue({ ...stats, pendingOrders: 0, readyToDispatch: 0 });
    await renderWithQuery(<FarmerDashboardScreen />);

    expect(await screen.findByText("You're up to date")).toBeTruthy();
    expect(screen.getByText('Nothing is waiting for you.')).toBeTruthy();
  });

  it('on a failed load says so, shows dashes and never zeros (FA-14), and recovers on Try again', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    await renderWithQuery(<FarmerDashboardScreen />);

    expect(await screen.findByText("Couldn't load your numbers")).toBeTruthy();
    expect(screen.getByText('Your numbers are not available')).toBeTruthy();
    expect(screen.getAllByText('—')).toHaveLength(2);
    expect(screen.queryByText('0')).toBeNull();
    expect(screen.queryByText('Nothing is waiting for you.')).toBeNull();
    // The scan does not depend on the numbers.
    expect(screen.getByText('Take photo')).toBeTruthy();

    mockFetch.mockResolvedValue(stats);
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('2 things need you')).toBeTruthy();
  });
});
