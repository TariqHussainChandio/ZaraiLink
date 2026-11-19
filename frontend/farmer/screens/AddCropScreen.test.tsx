import React from 'react';
import { fireEvent, screen, within } from '@testing-library/react-native';
import { createTestQueryClient, renderWithQuery } from '../../testUtils/renderWithProviders';
import { queryKeys } from '../../hooks/keys';
import { AddCropScreen } from './AddCropScreen';
import {
  createFarmCrop,
  deleteFarmCrop,
  fetchFarmCropById,
  updateFarmCrop,
} from '../services/farmService';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

const queryClient = createTestQueryClient();

jest.mock('../services/farmService', () => ({
  createFarmCrop: jest.fn(),
  updateFarmCrop: jest.fn(),
  deleteFarmCrop: jest.fn(),
  fetchFarmCropById: jest.fn(),
}));

const mockCreateFarmCrop = createFarmCrop as jest.Mock;
const mockUpdateFarmCrop = updateFarmCrop as jest.Mock;
const mockDeleteFarmCrop = deleteFarmCrop as jest.Mock;
const mockFetchFarmCropById = fetchFarmCropById as jest.Mock;

const crop = { id: 'crop-1', crop_id: 'wheat', variety: 'HD-2967', planting_date: '2026-01-01',
  area: 5, expected_harvest_date: '2026-05-01', growth_stage: 'flowering', notes: 'irrigated' };

function makeProps(routeParams: { farmId: string; cropId?: string }) {
  return {
    navigation: { goBack: jest.fn() },
    route: { params: routeParams },
  } as unknown as HomeScreenProps<'AddCrop'>;
}

beforeEach(() => {
  mockCreateFarmCrop.mockReset();
  mockUpdateFarmCrop.mockReset();
  mockDeleteFarmCrop.mockReset();
  mockFetchFarmCropById.mockReset();
  queryClient.clear();
  queryClient.setQueryData(queryKeys.marketplace.crops(), [{ id: 'wheat', name: 'Wheat', category: null }]);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('AddCropScreen — create mode', () => {
  it('renders the Add Crop form with no crop preloaded', async () => {
    await renderWithQuery(<AddCropScreen {...makeProps({ farmId: 'farm-1' })} />, queryClient);
    expect(screen.getByText('Add Crop')).toBeTruthy();
    expect(screen.queryByText('Remove Crop')).toBeNull();
  });

  it('submits the filled fields and creates the crop', async () => {
    mockCreateFarmCrop.mockResolvedValue({ id: 'new-crop' });
    const props = makeProps({ farmId: 'farm-1' });
    await renderWithQuery(<AddCropScreen {...props} />, queryClient);

    await fireEvent.press(screen.getByText('Select...'));
    await fireEvent.press(screen.getByText('Wheat'));
    await fireEvent.changeText(screen.getByLabelText('Variety'), 'HD-2967');
    await fireEvent.changeText(screen.getByLabelText('Area'), '5');
    await fireEvent.press(screen.getByText('Add Crop'));

    expect(mockCreateFarmCrop).toHaveBeenCalledWith('farm-1', {
      cropId: 'wheat',
      variety: 'HD-2967',
      plantingDate: null,
      area: 5,
      expectedHarvestDate: null,
      growthStage: null,
      notes: null,
    });
    expect(props.navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('shows an error toast when creating the crop fails, and stays on the form', async () => {
    mockCreateFarmCrop.mockRejectedValue(new Error('Server unavailable'));
    const props = makeProps({ farmId: 'farm-1' });
    await renderWithQuery(<AddCropScreen {...props} />, queryClient);
    await fireEvent.press(screen.getByText('Add Crop'));

    expect(await screen.findByText('Crop not saved. Server unavailable')).toBeTruthy();
    expect(props.navigation.goBack).not.toHaveBeenCalled();
  });
});

describe('AddCropScreen — edit mode', () => {
  it('loads and prefills an existing crop', async () => {
    mockFetchFarmCropById.mockResolvedValue(crop);
    await renderWithQuery(<AddCropScreen {...makeProps({ farmId: 'farm-1', cropId: 'crop-1' })} />, queryClient);

    expect(await screen.findByDisplayValue('HD-2967')).toBeTruthy();
    expect(screen.getByDisplayValue('5')).toBeTruthy();
    expect(screen.getByText('Save Changes')).toBeTruthy();
    expect(screen.getByText('Remove Crop')).toBeTruthy();
  });

  it('shows a retry state when loading the crop fails', async () => {
    mockFetchFarmCropById.mockRejectedValue(new Error('Not found'));
    await renderWithQuery(<AddCropScreen {...makeProps({ farmId: 'farm-1', cropId: 'crop-1' })} />, queryClient);

    expect(await screen.findByText("Couldn't load this crop")).toBeTruthy();

    mockFetchFarmCropById.mockResolvedValue(crop);
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByDisplayValue('HD-2967')).toBeTruthy();
  });

  it('saves the edited crop via updateFarmCrop', async () => {
    mockFetchFarmCropById.mockResolvedValue(crop);
    mockUpdateFarmCrop.mockResolvedValue({ id: 'crop-1' });
    const props = makeProps({ farmId: 'farm-1', cropId: 'crop-1' });
    await renderWithQuery(<AddCropScreen {...props} />, queryClient);
    await screen.findByDisplayValue('HD-2967');

    await fireEvent.changeText(screen.getByLabelText('Variety'), 'HD-3086');
    await fireEvent.press(screen.getByText('Save Changes'));

    expect(mockUpdateFarmCrop).toHaveBeenCalledWith('crop-1', expect.objectContaining({ variety: 'HD-3086' }));
    expect(props.navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('asks in a sheet before removing, then removes the crop and goes back', async () => {
    mockFetchFarmCropById.mockResolvedValue(crop);
    mockDeleteFarmCrop.mockResolvedValue(undefined);
    const props = makeProps({ farmId: 'farm-1', cropId: 'crop-1' });
    await renderWithQuery(<AddCropScreen {...props} />, queryClient);
    await screen.findByDisplayValue('HD-2967');

    await fireEvent.press(screen.getByText('Remove Crop'));
    // The first press only opens the confirmation; nothing is removed yet.
    expect(mockDeleteFarmCrop).not.toHaveBeenCalled();

    // The sheet's own Remove Crop button confirms.
    await fireEvent.press(within(screen.getByLabelText('Remove this crop?')).getByText('Remove Crop'));

    expect(mockDeleteFarmCrop).toHaveBeenCalledWith('crop-1');
    expect(props.navigation.goBack).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Crop removed')).toBeTruthy();
  });

  it('keeps the crop when the sheet is dismissed with Keep Crop', async () => {
    mockFetchFarmCropById.mockResolvedValue(crop);
    const props = makeProps({ farmId: 'farm-1', cropId: 'crop-1' });
    await renderWithQuery(<AddCropScreen {...props} />, queryClient);
    await screen.findByDisplayValue('HD-2967');

    await fireEvent.press(screen.getByText('Remove Crop'));
    await fireEvent.press(screen.getByText('Keep Crop'));

    expect(mockDeleteFarmCrop).not.toHaveBeenCalled();
    expect(props.navigation.goBack).not.toHaveBeenCalled();
  });
});
