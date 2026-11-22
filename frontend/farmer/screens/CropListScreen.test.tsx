import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { CropListScreen } from './CropListScreen';
import { fetchFarmCrops } from '../services/farmService';
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
  fetchFarmCrops: jest.fn(),
}));

const mockFetchFarmCrops = fetchFarmCrops as jest.Mock;

function makeProps() {
  return {
    navigation: { navigate: jest.fn() },
    route: { params: { farmId: 'farm-1' } },
  } as unknown as HomeScreenProps<'CropList'>;
}

beforeEach(() => {
  mockFetchFarmCrops.mockReset();
});

describe('CropListScreen', () => {
  it('renders the crops for the farm, with the planting day in words', async () => {
    mockFetchFarmCrops.mockResolvedValue([
      {
        id: 'crop-1',
        variety: 'HD-2967',
        growth_stage: 'Flowering',
        planting_date: '2020-01-01',
        crop: { id: 'wheat', name: 'Wheat' },
      },
    ]);
    await renderWithQuery(<CropListScreen {...makeProps()} />);

    expect(await screen.findByText('Wheat')).toBeTruthy();
    expect(screen.getByText('HD-2967 · Flowering · Planted 1 Jan 2020')).toBeTruthy();
    expect(mockFetchFarmCrops).toHaveBeenCalledWith('farm-1');
  });

  it('shows an empty state that offers to add a crop', async () => {
    mockFetchFarmCrops.mockResolvedValue([]);
    const props = makeProps();
    await renderWithQuery(<CropListScreen {...props} />);
    expect(await screen.findByText('No crops recorded')).toBeTruthy();

    await fireEvent.press(screen.getByText('Add crop'));
    expect(props.navigation.navigate).toHaveBeenCalledWith(HOME_ROUTES.AddCrop, { farmId: 'farm-1' });
  });

  it('shows the failure with Try again, and recovers', async () => {
    mockFetchFarmCrops.mockRejectedValue(new Error('Network error'));
    await renderWithQuery(<CropListScreen {...makeProps()} />);
    expect(await screen.findByText("Couldn't load the crops")).toBeTruthy();

    mockFetchFarmCrops.mockResolvedValue([]);
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('No crops recorded')).toBeTruthy();
  });

  it('opens the crop for editing when its row is pressed', async () => {
    mockFetchFarmCrops.mockResolvedValue([{ id: 'crop-1', variety: null, growth_stage: null, planting_date: null, crop: null }]);
    const props = makeProps();
    await renderWithQuery(<CropListScreen {...props} />);

    await fireEvent.press(await screen.findByText('Crop not chosen'));
    expect(props.navigation.navigate).toHaveBeenCalledWith(HOME_ROUTES.AddCrop, { farmId: 'farm-1', cropId: 'crop-1' });
  });
});
