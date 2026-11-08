import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { createTestQueryClient, renderWithQuery } from '../../testUtils/renderWithProviders';
import { queryKeys } from '../../hooks/keys';
import { CreateFarmScreen } from './CreateFarmScreen';
import { createFarm } from '../services/farmService';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

const queryClient = createTestQueryClient();

jest.mock('../services/farmService', () => ({
  createFarm: jest.fn(),
}));

const mockCreateFarm = createFarm as jest.Mock;

function makeNavigation() {
  return { goBack: jest.fn() } as unknown as HomeScreenProps<'CreateFarm'>['navigation'];
}

beforeEach(() => {
  mockCreateFarm.mockReset();
  queryClient.clear();
  queryClient.setQueryData(queryKeys.referenceData.units(), [
    { id: 'u1', code: 'acre', label: 'Acre', applies_to: 'area' },
    { id: 'u2', code: 'kanal', label: 'Kanal', applies_to: 'area' },
  ]);
});

describe('CreateFarmScreen', () => {
  it('renders the form with the optional fields marked and the unit as chips', async () => {
    await renderWithQuery(<CreateFarmScreen navigation={makeNavigation()} route={{} as never} />, queryClient);
    expect(screen.getByLabelText('Farm name')).toBeTruthy();
    expect(screen.getByText('Choose a province')).toBeTruthy();
    expect(screen.getByText('Acre')).toBeTruthy();
    expect(screen.getByText('Kanal')).toBeTruthy();
    // Area and notes say so; the name does not.
    expect(screen.getAllByText('Optional')).toHaveLength(2);
    expect(screen.getByText('Add farm')).toBeTruthy();
  });

  it('shows a validation error when the farm name is too short', async () => {
    await renderWithQuery(<CreateFarmScreen navigation={makeNavigation()} route={{} as never} />, queryClient);
    await fireEvent.changeText(screen.getByLabelText('Farm name'), 'A');
    await fireEvent.press(screen.getByText('Add farm'));
    expect(await screen.findByText('Enter a farm name')).toBeTruthy();
    expect(mockCreateFarm).not.toHaveBeenCalled();
  });

  it('refuses an area typed with a comma instead of saving no area', async () => {
    await renderWithQuery(<CreateFarmScreen navigation={makeNavigation()} route={{} as never} />, queryClient);
    await fireEvent.changeText(screen.getByLabelText('Farm name'), 'Green Acres');
    await fireEvent.changeText(screen.getByLabelText('Area'), '2,5');
    await fireEvent.press(screen.getByText('Acre'));
    await fireEvent.press(screen.getByText('Add farm'));
    expect(await screen.findByText('Enter the area as a number, for example 2.5')).toBeTruthy();
    expect(mockCreateFarm).not.toHaveBeenCalled();
  });

  it('asks for the unit when an area is given', async () => {
    await renderWithQuery(<CreateFarmScreen navigation={makeNavigation()} route={{} as never} />, queryClient);
    await fireEvent.changeText(screen.getByLabelText('Farm name'), 'Green Acres');
    await fireEvent.changeText(screen.getByLabelText('Area'), '10');
    await fireEvent.press(screen.getByText('Add farm'));
    expect(await screen.findByText('Choose the unit of the area')).toBeTruthy();
    expect(mockCreateFarm).not.toHaveBeenCalled();
  });

  it('creates the farm with the province, area and unit, confirms with a snackbar and goes back', async () => {
    mockCreateFarm.mockResolvedValue({ id: 'farm-1' });
    const navigation = makeNavigation();
    await renderWithQuery(<CreateFarmScreen navigation={navigation} route={{} as never} />, queryClient);

    await fireEvent.changeText(screen.getByLabelText('Farm name'), 'Green Acres');
    await fireEvent.press(screen.getByText('Choose a province'));
    await fireEvent.press(screen.getByText('Punjab'));
    await fireEvent.changeText(screen.getByLabelText('Area'), '10.5');
    await fireEvent.press(screen.getByText('Acre'));
    await fireEvent.press(screen.getByText('Add farm'));

    expect(mockCreateFarm).toHaveBeenCalledWith({
      name: 'Green Acres',
      area: 10.5,
      landUnit: 'acre',
      notes: null,
      country: 'Pakistan',
      province: 'Punjab',
      city: null,
    });
    expect(await screen.findByText('Farm added')).toBeTruthy();
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('says why when creating the farm fails, and stays on the form', async () => {
    mockCreateFarm.mockRejectedValue(new Error('Server unavailable'));
    const navigation = makeNavigation();
    await renderWithQuery(<CreateFarmScreen navigation={navigation} route={{} as never} />, queryClient);

    await fireEvent.changeText(screen.getByLabelText('Farm name'), 'Green Acres');
    await fireEvent.press(screen.getByText('Add farm'));

    expect(await screen.findByText(/Couldn't add the farm/)).toBeTruthy();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});
