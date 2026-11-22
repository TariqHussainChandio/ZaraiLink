import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { createTestQueryClient, renderWithQuery } from '../../testUtils/renderWithProviders';
import { queryKeys } from '../../hooks/keys';
import { AddCropScreen } from './AddCropScreen';
import { createFarmCrop, deleteFarmCrop, fetchFarmById, fetchFarmCropById, updateFarmCrop } from '../services/farmService';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

const queryClient = createTestQueryClient();

jest.mock('../services/farmService', () => ({
  createFarmCrop: jest.fn(),
  updateFarmCrop: jest.fn(),
  deleteFarmCrop: jest.fn(),
  fetchFarmCropById: jest.fn(),
  fetchFarmById: jest.fn(),
}));

const mockCreateFarmCrop = createFarmCrop as jest.Mock;
const mockUpdateFarmCrop = updateFarmCrop as jest.Mock;
const mockDeleteFarmCrop = deleteFarmCrop as jest.Mock;
const mockFetchFarmCropById = fetchFarmCropById as jest.Mock;
const mockFetchFarmById = fetchFarmById as jest.Mock;

const crop = {
  id: 'crop-1',
  crop_id: 'wheat',
  variety: 'HD-2967',
  planting_date: '2026-01-01',
  area: 5,
  expected_harvest_date: '2026-05-01',
  growth_stage: 'Flowering',
  notes: 'irrigated',
};

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
  mockFetchFarmById.mockReset();
  mockFetchFarmById.mockResolvedValue({ id: 'farm-1', name: 'Green Acres', land_unit: 'acre' });
  queryClient.clear();
  queryClient.setQueryData(queryKeys.marketplace.crops(), [{ id: 'wheat', name: 'Wheat', category: null }]);
  queryClient.setQueryData(queryKeys.referenceData.units(), [{ id: 'u1', code: 'acre', label: 'Acre', applies_to: 'area' }]);
});

describe('AddCropScreen create mode', () => {
  it('renders an empty form with the optional fields marked and the stage as chips', async () => {
    await renderWithQuery(<AddCropScreen {...makeProps({ farmId: 'farm-1' })} />, queryClient);
    expect(screen.getByText('Add crop')).toBeTruthy();
    expect(screen.getByText('Choose a crop')).toBeTruthy();
    expect(screen.getByText('Flowering')).toBeTruthy();
    // Variety, both dates, area, stage and notes are optional; the crop is not.
    expect(screen.getAllByText('Optional')).toHaveLength(6);
    expect(screen.queryByText('Remove this crop')).toBeNull();
  });

  it('shows the date format under each date box', async () => {
    await renderWithQuery(<AddCropScreen {...makeProps({ farmId: 'farm-1' })} />, queryClient);
    expect(screen.getAllByText('Type it as year-month-day, for example 2026-03-14')).toHaveLength(2);
  });

  it('requires a crop', async () => {
    await renderWithQuery(<AddCropScreen {...makeProps({ farmId: 'farm-1' })} />, queryClient);
    await fireEvent.press(screen.getByText('Add crop'));

    // The error and the placeholder both read "Choose a crop".
    expect(await screen.findAllByText('Choose a crop')).toHaveLength(2);
    expect(mockCreateFarmCrop).not.toHaveBeenCalled();
  });

  it('refuses a date that does not exist and a harvest before the planting', async () => {
    await renderWithQuery(<AddCropScreen {...makeProps({ farmId: 'farm-1' })} />, queryClient);
    await fireEvent.press(screen.getByText('Choose a crop'));
    await fireEvent.press(screen.getByText('Wheat'));
    await fireEvent.changeText(screen.getByLabelText('Planting date'), '2026-02-30');
    await fireEvent.press(screen.getByText('Add crop'));
    expect(await screen.findByText('Use year-month-day, for example 2026-03-14')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Planting date'), '2026-05-01');
    await fireEvent.changeText(screen.getByLabelText('Expected harvest date'), '2026-04-01');
    await fireEvent.press(screen.getByText('Add crop'));
    expect(await screen.findByText('The harvest date cannot be before the planting date')).toBeTruthy();
    expect(mockCreateFarmCrop).not.toHaveBeenCalled();
  });

  it('creates the crop, confirms with a snackbar and goes back', async () => {
    mockCreateFarmCrop.mockResolvedValue({ id: 'new-crop' });
    const props = makeProps({ farmId: 'farm-1' });
    await renderWithQuery(<AddCropScreen {...props} />, queryClient);

    await fireEvent.press(screen.getByText('Choose a crop'));
    await fireEvent.press(screen.getByText('Wheat'));
    await fireEvent.changeText(screen.getByLabelText('Variety'), 'HD-2967');
    await fireEvent.changeText(screen.getByLabelText('Area of Wheat'), '5');
    await fireEvent.press(screen.getByText('Sown'));
    await fireEvent.press(screen.getByText('Add crop'));

    expect(mockCreateFarmCrop).toHaveBeenCalledWith('farm-1', {
      cropId: 'wheat',
      variety: 'HD-2967',
      plantingDate: null,
      area: 5,
      expectedHarvestDate: null,
      growthStage: 'Sown',
      notes: null,
    });
    expect(await screen.findByText('Crop added')).toBeTruthy();
    expect(props.navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('says why when creating the crop fails, and stays on the form', async () => {
    mockCreateFarmCrop.mockRejectedValue(new Error('Server unavailable'));
    const props = makeProps({ farmId: 'farm-1' });
    await renderWithQuery(<AddCropScreen {...props} />, queryClient);
    await fireEvent.press(screen.getByText('Choose a crop'));
    await fireEvent.press(screen.getByText('Wheat'));
    await fireEvent.press(screen.getByText('Add crop'));

    expect(await screen.findByText(/Couldn't save the crop/)).toBeTruthy();
    expect(props.navigation.goBack).not.toHaveBeenCalled();
  });
});

describe('AddCropScreen edit mode', () => {
  it('loads and prefills an existing crop, keeping a stage saved in the old free text', async () => {
    mockFetchFarmCropById.mockResolvedValue({ ...crop, growth_stage: 'Tillering' });
    await renderWithQuery(<AddCropScreen {...makeProps({ farmId: 'farm-1', cropId: 'crop-1' })} />, queryClient);

    expect(await screen.findByDisplayValue('HD-2967')).toBeTruthy();
    expect(screen.getByDisplayValue('5')).toBeTruthy();
    expect(screen.getByDisplayValue('2026-01-01')).toBeTruthy();
    expect(screen.getByText('Tillering')).toBeTruthy();
    expect(screen.getByText('Save changes')).toBeTruthy();
    expect(screen.getByText('Remove this crop')).toBeTruthy();
  });

  it('shows the failure with Try again, and recovers', async () => {
    mockFetchFarmCropById.mockRejectedValue(new Error('Not found'));
    await renderWithQuery(<AddCropScreen {...makeProps({ farmId: 'farm-1', cropId: 'crop-1' })} />, queryClient);

    expect(await screen.findByText("Couldn't load this crop")).toBeTruthy();

    mockFetchFarmCropById.mockResolvedValue(crop);
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByDisplayValue('HD-2967')).toBeTruthy();
  });

  it('saves the edited crop via updateFarmCrop', async () => {
    mockFetchFarmCropById.mockResolvedValue(crop);
    mockUpdateFarmCrop.mockResolvedValue({ id: 'crop-1' });
    const props = makeProps({ farmId: 'farm-1', cropId: 'crop-1' });
    await renderWithQuery(<AddCropScreen {...props} />, queryClient);
    await screen.findByDisplayValue('HD-2967');

    await fireEvent.changeText(screen.getByLabelText('Variety'), 'HD-3086');
    await fireEvent.press(screen.getByText('Save changes'));

    expect(mockUpdateFarmCrop).toHaveBeenCalledWith('crop-1', expect.objectContaining({ variety: 'HD-3086', cropId: 'wheat' }));
    expect(await screen.findByText('Crop updated')).toBeTruthy();
    expect(props.navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('asks before removing, and removes only after the confirmation', async () => {
    mockFetchFarmCropById.mockResolvedValue(crop);
    mockDeleteFarmCrop.mockResolvedValue(undefined);
    const props = makeProps({ farmId: 'farm-1', cropId: 'crop-1' });
    await renderWithQuery(<AddCropScreen {...props} />, queryClient);
    await screen.findByDisplayValue('HD-2967');

    await fireEvent.press(screen.getByText('Remove this crop'));
    expect(await screen.findByText('Remove Wheat?')).toBeTruthy();
    expect(mockDeleteFarmCrop).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Remove crop'));
    expect(mockDeleteFarmCrop).toHaveBeenCalledWith('crop-1');
    expect(await screen.findByText('Crop removed')).toBeTruthy();
    expect(props.navigation.goBack).toHaveBeenCalledTimes(1);
  });
});
