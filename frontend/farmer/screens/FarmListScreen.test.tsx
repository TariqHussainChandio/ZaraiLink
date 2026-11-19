import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { createTestQueryClient, renderWithQuery } from '../../testUtils/renderWithProviders';
import { queryKeys } from '../../hooks/keys';
import { FarmListScreen } from './FarmListScreen';
import { fetchFarms } from '../services/farmService';
import { useAuthStore } from '../../state/authStore';
import { HOME_ROUTES } from '../../common/constants/routes';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

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

jest.mock('../services/farmService', () => ({
  fetchFarms: jest.fn(),
}));

const mockFetchFarms = fetchFarms as jest.Mock;
const queryClient = createTestQueryClient();

function makeProps() {
  return {
    navigation: { navigate: jest.fn() },
    route: {},
  } as unknown as HomeScreenProps<'FarmList'>;
}

beforeEach(() => {
  mockFetchFarms.mockReset();
  queryClient.clear();
  queryClient.setQueryData(queryKeys.referenceData.units(), [{ id: 'u1', code: 'acre', label: 'Acre', applies_to: 'area' }]);
  useAuthStore.setState({ user: { id: 'user-1' } as never });
});

describe('FarmListScreen', () => {
  it('renders the farms with their city and area', async () => {
    mockFetchFarms.mockResolvedValue([
      { id: 'farm-1', name: 'Green Acres', area: 10, land_unit: 'acre', location: { city: 'Lahore' } },
      { id: 'farm-2', name: 'North Field', area: null, land_unit: null, location: null },
    ]);
    await renderWithQuery(<FarmListScreen {...makeProps()} />, queryClient);

    expect(await screen.findByText('Green Acres')).toBeTruthy();
    expect(screen.getByText('Lahore · 10 Acre')).toBeTruthy();
    expect(screen.getByText('North Field')).toBeTruthy();
    expect(screen.getByText('Area not set')).toBeTruthy();
  });

  it('shows an empty state that offers to add a farm', async () => {
    mockFetchFarms.mockResolvedValue([]);
    const props = makeProps();
    await renderWithQuery(<FarmListScreen {...props} />, queryClient);
    expect(await screen.findByText('No farms yet')).toBeTruthy();

    await fireEvent.press(screen.getByText('Add farm'));
    expect(props.navigation.navigate).toHaveBeenCalledWith(HOME_ROUTES.CreateFarm);
  });

  it('shows the failure with Try again, and recovers', async () => {
    mockFetchFarms.mockRejectedValue(new Error('Network error'));
    await renderWithQuery(<FarmListScreen {...makeProps()} />, queryClient);
    expect(await screen.findByText("Couldn't load your farms")).toBeTruthy();

    mockFetchFarms.mockResolvedValue([]);
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('No farms yet')).toBeTruthy();
  });

  it('opens the farm summary when a farm is pressed', async () => {
    mockFetchFarms.mockResolvedValue([{ id: 'farm-1', name: 'Green Acres', area: 10, land_unit: 'acre', location: null }]);
    const props = makeProps();
    await renderWithQuery(<FarmListScreen {...props} />, queryClient);

    await fireEvent.press(await screen.findByText('Green Acres'));
    expect(props.navigation.navigate).toHaveBeenCalledWith(HOME_ROUTES.FarmDetail, { farmId: 'farm-1' });
  });

  it('keeps "Add farm" in reach beside a list of farms', async () => {
    mockFetchFarms.mockResolvedValue([{ id: 'farm-1', name: 'Green Acres', area: null, land_unit: null, location: null }]);
    const props = makeProps();
    await renderWithQuery(<FarmListScreen {...props} />, queryClient);
    await screen.findByText('Green Acres');

    await fireEvent.press(screen.getByText('Add farm'));
    expect(props.navigation.navigate).toHaveBeenCalledWith(HOME_ROUTES.CreateFarm);
  });
});
