import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { createTestQueryClient, renderWithQuery } from '../../testUtils/renderWithProviders';
import { queryKeys } from '../../hooks/keys';
import { CreateFarmScreen } from './CreateFarmScreen';
import { createFarm } from '../services/farmService';
import { useAuthStore } from '../../state/authStore';
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
  useAuthStore.setState({ user: { id: 'user-1' } as never });
  queryClient.clear();
  queryClient.setQueryData(queryKeys.referenceData.units(), [{ id: 'u1', code: 'acre', label: 'Acre', applies_to: 'area' }]);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('CreateFarmScreen', () => {
  it('renders the empty form', async () => {
    await renderWithQuery(<CreateFarmScreen navigation={makeNavigation()} route={{} as never} />, queryClient);
    expect(screen.getByLabelText('Farm name')).toBeTruthy();
    expect(screen.getByText('Create Farm')).toBeTruthy();
  });

  it('shows a validation error when the farm name is too short', async () => {
    await renderWithQuery(<CreateFarmScreen navigation={makeNavigation()} route={{} as never} />, queryClient);
    await fireEvent.changeText(screen.getByLabelText('Farm name'), 'A');
    await fireEvent.press(screen.getByText('Create Farm'));
    expect(await screen.findByText('Enter a farm name')).toBeTruthy();
    expect(mockCreateFarm).not.toHaveBeenCalled();
  });

  it('creates the farm with the filled fields and goes back', async () => {
    mockCreateFarm.mockResolvedValue({ id: 'farm-1' });
    const navigation = makeNavigation();
    await renderWithQuery(<CreateFarmScreen navigation={navigation} route={{} as never} />, queryClient);

    await fireEvent.changeText(screen.getByLabelText('Farm name'), 'Green Acres');
    await fireEvent.changeText(screen.getByLabelText('Area'), '10');
    await fireEvent.press(screen.getByText('Select...'));
    await fireEvent.press(screen.getByText('Acre'));
    await fireEvent.press(screen.getByText('Create Farm'));

    expect(mockCreateFarm).toHaveBeenCalledWith({
      name: 'Green Acres',
      area: 10,
      landUnit: 'acre',
      notes: null,
      country: null,
      province: null,
      city: null,
    });
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Farm added')).toBeTruthy();
  });

  it('shows an error toast when creating the farm fails, and stays on the form', async () => {
    mockCreateFarm.mockRejectedValue(new Error('Server unavailable'));
    const navigation = makeNavigation();
    await renderWithQuery(<CreateFarmScreen navigation={navigation} route={{} as never} />, queryClient);

    await fireEvent.changeText(screen.getByLabelText('Farm name'), 'Green Acres');
    await fireEvent.press(screen.getByText('Create Farm'));

    expect(await screen.findByText('Farm not added. Server unavailable')).toBeTruthy();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});
