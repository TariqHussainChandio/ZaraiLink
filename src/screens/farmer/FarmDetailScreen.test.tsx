import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import { createTestQueryClient, renderWithQuery } from '../../testUtils/renderWithProviders';
import { queryKeys } from '../../hooks/api/keys';
import { FarmDetailScreen } from './FarmDetailScreen';
import { deleteFarm, fetchFarmById, updateFarm } from '../../services/modules/farmer/farmService';
import { HOME_ROUTES } from '../../constants/routes';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

const queryClient = createTestQueryClient();

jest.mock('../../services/modules/farmer/farmService', () => ({
  fetchFarmById: jest.fn(),
  updateFarm: jest.fn(),
  deleteFarm: jest.fn(),
}));

const mockFetchFarmById = fetchFarmById as jest.Mock;
const mockUpdateFarm = updateFarm as jest.Mock;
const mockDeleteFarm = deleteFarm as jest.Mock;

const farm = {
  id: 'farm-1',
  name: 'Green Acres',
  area: 10,
  land_unit: 'acre',
  notes: 'Well irrigated',
  location: { country: 'Pakistan', province: 'Punjab', city: 'Lahore' },
};

function makeProps() {
  return {
    navigation: { navigate: jest.fn(), goBack: jest.fn(), popToTop: jest.fn() },
    route: { params: { farmId: 'farm-1' } },
  } as unknown as HomeScreenProps<'FarmDetail'>;
}

beforeEach(() => {
  mockFetchFarmById.mockReset();
  mockUpdateFarm.mockReset();
  mockDeleteFarm.mockReset();
  queryClient.clear();
  queryClient.setQueryData(queryKeys.referenceData.units(), [{ id: 'u1', code: 'acre', label: 'Acre', applies_to: 'area' }]);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('FarmDetailScreen', () => {
  it('loads and prefills the farm details', async () => {
    mockFetchFarmById.mockResolvedValue(farm);
    await renderWithQuery(<FarmDetailScreen {...makeProps()} />, queryClient);

    expect(await screen.findByDisplayValue('Green Acres')).toBeTruthy();
    expect(screen.getByDisplayValue('10')).toBeTruthy();
    expect(screen.getByDisplayValue('Well irrigated')).toBeTruthy();
    expect(screen.getByDisplayValue('Lahore')).toBeTruthy();
  });

  it('shows a retry state when loading fails, and recovers on retry', async () => {
    mockFetchFarmById.mockRejectedValue(new Error('Network error'));
    await renderWithQuery(<FarmDetailScreen {...makeProps()} />, queryClient);
    expect(await screen.findByText("Couldn't load this farm")).toBeTruthy();

    mockFetchFarmById.mockResolvedValue(farm);
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByDisplayValue('Green Acres')).toBeTruthy();
  });

  it('saves changes via updateFarm and goes back', async () => {
    mockFetchFarmById.mockResolvedValue(farm);
    mockUpdateFarm.mockResolvedValue({ ...farm, name: 'Greener Acres' });
    const props = makeProps();
    await renderWithQuery(<FarmDetailScreen {...props} />, queryClient);
    await screen.findByDisplayValue('Green Acres');

    await fireEvent.changeText(screen.getByDisplayValue('Green Acres'), 'Greener Acres');
    await fireEvent.press(screen.getByText('Save Changes'));

    expect(mockUpdateFarm).toHaveBeenCalledWith('farm-1', expect.objectContaining({ name: 'Greener Acres' }));
    expect(props.navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('shows an alert when saving fails', async () => {
    mockFetchFarmById.mockResolvedValue(farm);
    mockUpdateFarm.mockRejectedValue(new Error('Server unavailable'));
    const props = makeProps();
    await renderWithQuery(<FarmDetailScreen {...props} />, queryClient);
    await screen.findByDisplayValue('Green Acres');

    await fireEvent.press(screen.getByText('Save Changes'));

    expect(Alert.alert).toHaveBeenCalledWith('Failed to update farm', 'Server unavailable');
    expect(props.navigation.goBack).not.toHaveBeenCalled();
  });

  it('deletes the farm after confirming the alert and pops to top', async () => {
    mockFetchFarmById.mockResolvedValue(farm);
    mockDeleteFarm.mockResolvedValue(undefined);
    (Alert.alert as jest.Mock).mockImplementation((_title, _message, buttons) => {
      buttons?.find((b: { text: string }) => b.text === 'Delete')?.onPress?.();
    });
    const props = makeProps();
    await renderWithQuery(<FarmDetailScreen {...props} />, queryClient);
    await screen.findByDisplayValue('Green Acres');

    await fireEvent.press(screen.getByText('Delete Farm'));

    expect(mockDeleteFarm).toHaveBeenCalledWith('farm-1');
    expect(props.navigation.popToTop).toHaveBeenCalledTimes(1);
  });

  it('navigates to CropList for this farm', async () => {
    mockFetchFarmById.mockResolvedValue(farm);
    const props = makeProps();
    await renderWithQuery(<FarmDetailScreen {...props} />, queryClient);
    await screen.findByDisplayValue('Green Acres');

    await fireEvent.press(screen.getByText('Crops on this Farm'));

    expect(props.navigation.navigate).toHaveBeenCalledWith(HOME_ROUTES.CropList, { farmId: 'farm-1' });
  });
});
