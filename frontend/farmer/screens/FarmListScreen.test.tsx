import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
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

function makeProps() {
  return {
    navigation: { navigate: jest.fn() },
    route: {},
  } as unknown as HomeScreenProps<'FarmList'>;
}

beforeEach(() => {
  mockFetchFarms.mockReset();
  useAuthStore.setState({ user: { id: 'user-1' } as never });
});

describe('FarmListScreen', () => {
  it('renders the farms with their area and unit', async () => {
    mockFetchFarms.mockResolvedValue([
      { id: 'farm-1', name: 'Green Acres', area: 10, land_unit: 'acre' },
      { id: 'farm-2', name: 'North Field', area: null, land_unit: null },
    ]);
    await renderWithQuery(<FarmListScreen {...makeProps()} />);

    expect(await screen.findByText('Green Acres')).toBeTruthy();
    expect(screen.getByText('10 acre')).toBeTruthy();
    expect(screen.getByText('North Field')).toBeTruthy();
    expect(screen.getByText('Area not set')).toBeTruthy();
  });

  it('shows the empty state when there are no farms', async () => {
    mockFetchFarms.mockResolvedValue([]);
    await renderWithQuery(<FarmListScreen {...makeProps()} />);
    expect(await screen.findByText('No farms yet')).toBeTruthy();
  });

  it('shows a retry state when loading fails', async () => {
    mockFetchFarms.mockRejectedValue(new Error('Network error'));
    await renderWithQuery(<FarmListScreen {...makeProps()} />);
    expect(await screen.findByText("Couldn't load farms")).toBeTruthy();

    mockFetchFarms.mockResolvedValue([]);
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('No farms yet')).toBeTruthy();
  });

  it('navigates to FarmDetail when a farm card is pressed', async () => {
    mockFetchFarms.mockResolvedValue([{ id: 'farm-1', name: 'Green Acres', area: 10, land_unit: 'acre' }]);
    const props = makeProps();
    await renderWithQuery(<FarmListScreen {...props} />);

    await fireEvent.press(await screen.findByText('Green Acres'));
    expect(props.navigation.navigate).toHaveBeenCalledWith(HOME_ROUTES.FarmDetail, { farmId: 'farm-1' });
  });

  it('navigates to CreateFarm via the FAB', async () => {
    mockFetchFarms.mockResolvedValue([]);
    const props = makeProps();
    await renderWithQuery(<FarmListScreen {...props} />);
    await screen.findByText('No farms yet');

    await fireEvent.press(screen.getByText('+ New Farm'));
    expect(props.navigation.navigate).toHaveBeenCalledWith(HOME_ROUTES.CreateFarm);
  });
});
