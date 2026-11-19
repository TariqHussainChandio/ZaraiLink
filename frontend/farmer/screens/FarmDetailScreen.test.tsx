import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { createTestQueryClient, renderWithQuery } from '../../testUtils/renderWithProviders';
import { queryKeys } from '../../hooks/keys';
import { FarmDetailScreen } from './FarmDetailScreen';
import { deleteFarm, fetchFarmById, fetchFarmCrops, updateFarm } from '../services/farmService';
import { HOME_ROUTES } from '../../common/constants/routes';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

const queryClient = createTestQueryClient();

jest.mock('../services/farmService', () => ({
  fetchFarmById: jest.fn(),
  fetchFarmCrops: jest.fn(),
  updateFarm: jest.fn(),
  deleteFarm: jest.fn(),
}));

const mockFetchFarmById = fetchFarmById as jest.Mock;
const mockFetchFarmCrops = fetchFarmCrops as jest.Mock;
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
const crops = [
  { id: 'crop-1', variety: 'Basmati', growth_stage: 'Flowering', crop: { id: 'rice', name: 'Rice' } },
  { id: 'crop-2', variety: null, growth_stage: null, crop: { id: 'wheat', name: 'Wheat' } },
];

function makeProps() {
  return {
    navigation: { navigate: jest.fn(), goBack: jest.fn() },
    route: { params: { farmId: 'farm-1' } },
  } as unknown as HomeScreenProps<'FarmDetail'>;
}

beforeEach(() => {
  mockFetchFarmById.mockReset();
  mockFetchFarmCrops.mockReset();
  mockUpdateFarm.mockReset();
  mockDeleteFarm.mockReset();
  mockFetchFarmCrops.mockResolvedValue(crops);
  queryClient.clear();
  queryClient.setQueryData(queryKeys.referenceData.units(), [{ id: 'u1', code: 'acre', label: 'Acre', applies_to: 'area' }]);
});

describe('FarmDetailScreen summary', () => {
  it('opens as a summary: the place, the area and the crops growing on the farm', async () => {
    mockFetchFarmById.mockResolvedValue(farm);
    await renderWithQuery(<FarmDetailScreen {...makeProps()} />, queryClient);

    expect(await screen.findByText('Green Acres')).toBeTruthy();
    expect(screen.getByText('Lahore, Punjab')).toBeTruthy();
    expect(screen.getByText('10 Acre of land')).toBeTruthy();
    expect(screen.getByText('Well irrigated')).toBeTruthy();
    expect(await screen.findByText('Rice')).toBeTruthy();
    expect(screen.getByText('Basmati · Flowering')).toBeTruthy();
    expect(screen.getByText('Wheat')).toBeTruthy();
    // It is not a form: no field is on screen until Edit is pressed.
    expect(screen.queryByLabelText('Farm name')).toBeNull();
  });

  it('opens a crop for editing and adds a crop to this farm', async () => {
    mockFetchFarmById.mockResolvedValue(farm);
    const props = makeProps();
    await renderWithQuery(<FarmDetailScreen {...props} />, queryClient);

    await fireEvent.press(await screen.findByText('Rice'));
    expect(props.navigation.navigate).toHaveBeenCalledWith(HOME_ROUTES.AddCrop, { farmId: 'farm-1', cropId: 'crop-1' });

    await fireEvent.press(screen.getByText('Add crop'));
    expect(props.navigation.navigate).toHaveBeenCalledWith(HOME_ROUTES.AddCrop, { farmId: 'farm-1' });
  });

  it('offers Add crop from the empty state when the farm has no crops', async () => {
    mockFetchFarmById.mockResolvedValue(farm);
    mockFetchFarmCrops.mockResolvedValue([]);
    const props = makeProps();
    await renderWithQuery(<FarmDetailScreen {...props} />, queryClient);

    expect(await screen.findByText('No crops recorded')).toBeTruthy();
    await fireEvent.press(screen.getByText('Add crop'));
    expect(props.navigation.navigate).toHaveBeenCalledWith(HOME_ROUTES.AddCrop, { farmId: 'farm-1' });
  });

  it('shows the failure with Try again, and recovers', async () => {
    mockFetchFarmById.mockRejectedValue(new Error('Network error'));
    await renderWithQuery(<FarmDetailScreen {...makeProps()} />, queryClient);
    expect(await screen.findByText("Couldn't load this farm")).toBeTruthy();

    mockFetchFarmById.mockResolvedValue(farm);
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('Green Acres')).toBeTruthy();
  });
});

describe('FarmDetailScreen editing', () => {
  it('Edit farm opens the form filled in, and Cancel returns to the summary', async () => {
    mockFetchFarmById.mockResolvedValue(farm);
    await renderWithQuery(<FarmDetailScreen {...makeProps()} />, queryClient);

    await fireEvent.press(await screen.findByText('Edit farm'));
    expect(screen.getByDisplayValue('Green Acres')).toBeTruthy();
    expect(screen.getByDisplayValue('10')).toBeTruthy();
    expect(screen.getByDisplayValue('Well irrigated')).toBeTruthy();
    expect(screen.getByDisplayValue('Lahore')).toBeTruthy();
    expect(screen.getByText('Punjab')).toBeTruthy();

    await fireEvent.press(screen.getByText('Cancel'));
    expect(screen.queryByLabelText('Farm name')).toBeNull();
    expect(screen.getByText('Edit farm')).toBeTruthy();
  });

  it('saves via updateFarm, confirms with a snackbar and returns to the summary', async () => {
    mockFetchFarmById.mockResolvedValue(farm);
    mockUpdateFarm.mockResolvedValue({ ...farm, name: 'Greener Acres' });
    await renderWithQuery(<FarmDetailScreen {...makeProps()} />, queryClient);

    await fireEvent.press(await screen.findByText('Edit farm'));
    await fireEvent.changeText(screen.getByDisplayValue('Green Acres'), 'Greener Acres');
    await fireEvent.press(screen.getByText('Save changes'));

    expect(mockUpdateFarm).toHaveBeenCalledWith('farm-1', expect.objectContaining({ name: 'Greener Acres', area: 10, landUnit: 'acre' }));
    expect(await screen.findByText('Farm updated')).toBeTruthy();
    expect(screen.queryByLabelText('Farm name')).toBeNull();
  });

  it('says why a save failed and keeps the form open', async () => {
    mockFetchFarmById.mockResolvedValue(farm);
    mockUpdateFarm.mockRejectedValue(new Error('Server unavailable'));
    await renderWithQuery(<FarmDetailScreen {...makeProps()} />, queryClient);

    await fireEvent.press(await screen.findByText('Edit farm'));
    await fireEvent.press(screen.getByText('Save changes'));

    expect(await screen.findByText(/Couldn't save the farm/)).toBeTruthy();
    expect(screen.getByLabelText('Farm name')).toBeTruthy();
  });

  it('asks before deleting, names the consequence, and deletes only after the confirmation', async () => {
    mockFetchFarmById.mockResolvedValue(farm);
    mockDeleteFarm.mockResolvedValue(undefined);
    const props = makeProps();
    await renderWithQuery(<FarmDetailScreen {...props} />, queryClient);
    await screen.findByText('Rice');

    await fireEvent.press(await screen.findByText('Edit farm'));
    await fireEvent.press(screen.getByText('Delete this farm'));

    expect(await screen.findByText('Delete Green Acres?')).toBeTruthy();
    expect(screen.getByText('Its 2 recorded crops are removed too. This cannot be undone.')).toBeTruthy();
    expect(mockDeleteFarm).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Delete farm'));
    expect(mockDeleteFarm).toHaveBeenCalledWith('farm-1');
    expect(await screen.findByText('Farm deleted')).toBeTruthy();
    expect(props.navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('keeps the farm when the person chooses to keep it', async () => {
    mockFetchFarmById.mockResolvedValue(farm);
    await renderWithQuery(<FarmDetailScreen {...makeProps()} />, queryClient);

    await fireEvent.press(await screen.findByText('Edit farm'));
    await fireEvent.press(screen.getByText('Delete this farm'));
    await fireEvent.press(await screen.findByText('Keep the farm'));

    expect(mockDeleteFarm).not.toHaveBeenCalled();
  });
});
