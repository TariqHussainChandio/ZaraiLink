import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { CropListScreen } from './CropListScreen';
import { fetchFarmCrops } from '../../services/modules/farmer/farmService';
import { HOME_ROUTES } from '../../constants/routes';
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

jest.mock('../../services/modules/farmer/farmService', () => ({
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
  it('renders the crops for the farm', async () => {
    mockFetchFarmCrops.mockResolvedValue([
      {
        id: 'crop-1',
        variety: 'HD-2967',
        growth_stage: 'flowering',
        planting_date: '2026-01-01',
        crop: { id: 'wheat', name: 'Wheat' },
      },
    ]);
    await renderWithQuery(<CropListScreen {...makeProps()} />);

    expect(await screen.findByText('Wheat')).toBeTruthy();
    expect(screen.getByText('HD-2967 · flowering')).toBeTruthy();
    expect(screen.getByText('Planted 2026-01-01')).toBeTruthy();
    expect(mockFetchFarmCrops).toHaveBeenCalledWith('farm-1');
  });

  it('shows the empty state when there are no crops', async () => {
    mockFetchFarmCrops.mockResolvedValue([]);
    await renderWithQuery(<CropListScreen {...makeProps()} />);
    expect(await screen.findByText('No crops recorded')).toBeTruthy();
  });

  it('shows a retry state when loading fails', async () => {
    mockFetchFarmCrops.mockRejectedValue(new Error('Network error'));
    await renderWithQuery(<CropListScreen {...makeProps()} />);
    expect(await screen.findByText("Couldn't load crops")).toBeTruthy();

    mockFetchFarmCrops.mockResolvedValue([]);
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('No crops recorded')).toBeTruthy();
  });

  it('navigates to AddCrop with the crop id when a crop card is pressed', async () => {
    mockFetchFarmCrops.mockResolvedValue([
      { id: 'crop-1', variety: null, growth_stage: null, planting_date: null, crop: null },
    ]);
    const props = makeProps();
    await renderWithQuery(<CropListScreen {...props} />);

    await fireEvent.press(await screen.findByText('Unspecified crop'));
    expect(props.navigation.navigate).toHaveBeenCalledWith(HOME_ROUTES.AddCrop, {
      farmId: 'farm-1',
      cropId: 'crop-1',
    });
  });

  it('navigates to AddCrop with no crop id via the FAB', async () => {
    mockFetchFarmCrops.mockResolvedValue([]);
    const props = makeProps();
    await renderWithQuery(<CropListScreen {...props} />);
    await screen.findByText('No crops recorded');

    await fireEvent.press(screen.getByText('+ Add Crop'));
    expect(props.navigation.navigate).toHaveBeenCalledWith(HOME_ROUTES.AddCrop, { farmId: 'farm-1' });
  });
});
