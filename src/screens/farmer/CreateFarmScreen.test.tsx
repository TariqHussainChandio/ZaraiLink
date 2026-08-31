import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { CreateFarmScreen } from './CreateFarmScreen';
import { createFarm } from '../../services/modules/farmer/farmService';
import { useAuthStore } from '../../store/authStore';
import { useReferenceDataStore } from '../../store/referenceDataStore';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

jest.mock('../../services/modules/farmer/farmService', () => ({
  createFarm: jest.fn(),
}));

const mockCreateFarm = createFarm as jest.Mock;

function makeNavigation() {
  return { goBack: jest.fn() } as unknown as HomeScreenProps<'CreateFarm'>['navigation'];
}

beforeEach(() => {
  mockCreateFarm.mockReset();
  useAuthStore.setState({ user: { id: 'user-1' } as never });
  useReferenceDataStore.setState({
    units: [{ id: 'u1', code: 'acre', label: 'Acre', applies_to: 'area' }],
    unitsLoaded: true,
  });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('CreateFarmScreen', () => {
  it('renders the empty form', async () => {
    await render(<CreateFarmScreen navigation={makeNavigation()} route={{} as never} />);
    expect(screen.getByLabelText('Farm name')).toBeTruthy();
    expect(screen.getByText('Create Farm')).toBeTruthy();
  });

  it('shows a validation error when the farm name is too short', async () => {
    await render(<CreateFarmScreen navigation={makeNavigation()} route={{} as never} />);
    await fireEvent.changeText(screen.getByLabelText('Farm name'), 'A');
    await fireEvent.press(screen.getByText('Create Farm'));
    expect(await screen.findByText('Enter a farm name')).toBeTruthy();
    expect(mockCreateFarm).not.toHaveBeenCalled();
  });

  it('creates the farm with the filled fields and goes back', async () => {
    mockCreateFarm.mockResolvedValue({ id: 'farm-1' });
    const navigation = makeNavigation();
    await render(<CreateFarmScreen navigation={navigation} route={{} as never} />);

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
  });

  it('shows an alert when creating the farm fails', async () => {
    mockCreateFarm.mockRejectedValue(new Error('Server unavailable'));
    const navigation = makeNavigation();
    await render(<CreateFarmScreen navigation={navigation} route={{} as never} />);

    await fireEvent.changeText(screen.getByLabelText('Farm name'), 'Green Acres');
    await fireEvent.press(screen.getByText('Create Farm'));

    expect(Alert.alert).toHaveBeenCalledWith('Failed to create farm', 'Server unavailable');
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});
