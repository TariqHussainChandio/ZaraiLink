import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { renderWithProviders } from '../../testUtils/renderWithProviders';
import * as service from '../services/inventoryService';
import { answerReads, lastByText, type MockedInventoryApi } from '../testUtils/api';
import { apiError, godown, location, screenProps, signInApprovedDealer } from '../testUtils/fixtures';
import { INVENTORY_ROUTES } from '../types/navigation';
import { LocationFormScreen } from './LocationFormScreen';
import { LocationListScreen } from './LocationListScreen';

jest.mock('../services/inventoryService');

const api = service as MockedInventoryApi;
const navigation = { navigate: jest.fn(), goBack: jest.fn() };

async function renderForm(locationId?: string) {
  await renderWithProviders(
    <LocationFormScreen {...screenProps<typeof INVENTORY_ROUTES.LocationForm>({ locationId }, navigation)} />,
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  answerReads(api);
  await signInApprovedDealer();
});

describe('LocationListScreen', () => {
  it('lists the locations, the default and inactive ones marked', async () => {
    api.fetchLocations.mockResolvedValue([
      location({ address: 'Hussain Agahi, Multan' }),
      godown(),
      godown({ id: 'loc-old', name: 'Old shelf', kind: 'shelf', is_active: false }),
    ]);
    await renderWithProviders(<LocationListScreen {...screenProps<typeof INVENTORY_ROUTES.Locations>(undefined, navigation)} />);
    expect(await screen.findByText('Shop · Hussain Agahi, Multan')).toBeTruthy();
    expect(screen.getByText('Default')).toBeTruthy();
    expect(screen.getByText('Inactive')).toBeTruthy();
    await fireEvent.press(screen.getByText('Back godown'));
    expect(navigation.navigate).toHaveBeenCalledWith(INVENTORY_ROUTES.LocationForm, { locationId: 'loc-godown' });
    await fireEvent.press(screen.getByText('Add location'));
    expect(navigation.navigate).toHaveBeenCalledWith(INVENTORY_ROUTES.LocationForm, {});
  });

  it('shows the empty state when there are none', async () => {
    api.fetchLocations.mockResolvedValueOnce([]);
    await renderWithProviders(<LocationListScreen {...screenProps<typeof INVENTORY_ROUTES.Locations>(undefined, navigation)} />);
    expect(await screen.findByText('No locations')).toBeTruthy();
  });

  it('shows a failed load with Retry', async () => {
    api.fetchLocations.mockRejectedValueOnce(apiError(503, 'service_unavailable', 'down'));
    await renderWithProviders(<LocationListScreen {...screenProps<typeof INVENTORY_ROUTES.Locations>(undefined, navigation)} />);
    expect(await screen.findByText("Couldn't load your locations")).toBeTruthy();
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('Main shop')).toBeTruthy();
  });
});

describe('LocationFormScreen', () => {
  it('adds a location, not as the default unless asked', async () => {
    api.createLocation.mockResolvedValue(godown({ id: 'loc-new' }));
    await renderForm();
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Shelf B');
    await fireEvent.press(screen.getByText('Add location'));
    await waitFor(() => expect(api.createLocation).toHaveBeenCalledWith({ name: 'Shelf B', kind: 'godown', address: null }));
    expect(await screen.findByText('Location saved')).toBeTruthy();
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('makes a location the default by sending is_default only then', async () => {
    api.updateLocation.mockResolvedValue(godown({ is_default: true }));
    await renderForm('loc-godown');
    expect(await screen.findByDisplayValue('Back godown')).toBeTruthy();
    await fireEvent(screen.getByRole('switch', { name: 'Default location' }), 'valueChange', true);
    await fireEvent.press(screen.getByText('Save changes'));
    await waitFor(() =>
      expect(api.updateLocation).toHaveBeenCalledWith('loc-godown', {
        name: 'Back godown',
        kind: 'godown',
        address: null,
        is_default: true,
      }),
    );
  });

  it('keeps the default location the default: its switch is locked and it cannot be removed', async () => {
    await renderForm('loc-shop');
    expect(await screen.findByDisplayValue('Main shop')).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Default location' })).toBeDisabled();
    expect(screen.getByText('The marketplace sells from this location. Make another one the default to change it.')).toBeTruthy();
    expect(screen.queryByText('Remove location')).toBeNull();
  });

  it('shows the default-location rule the API refuses with (409 conflict)', async () => {
    api.updateLocation.mockRejectedValue(apiError(409, 'conflict', 'The default location must be active'));
    await renderForm('loc-godown');
    await fireEvent(await screen.findByRole('switch', { name: 'Default location' }), 'valueChange', true);
    await fireEvent.press(screen.getByText('Save changes'));
    expect(await screen.findByText('The default location must be active')).toBeTruthy();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it('removes a location only after the sheet confirms', async () => {
    api.removeLocation.mockResolvedValue(undefined);
    await renderForm('loc-godown');
    await fireEvent.press(await screen.findByText('Remove location'));
    expect(screen.getByText('Remove this location?')).toBeTruthy();
    await fireEvent.press(lastByText('Remove location'));
    await waitFor(() => expect(api.removeLocation).toHaveBeenCalledWith('loc-godown'));
    expect(await screen.findByText('Location removed')).toBeTruthy();
  });

  it('validates the name and the address length', async () => {
    await renderForm();
    await fireEvent.changeText(screen.getByLabelText('Address'), 'a'.repeat(301));
    await fireEvent.press(screen.getByText('Add location'));
    expect(await screen.findByText('Enter a name for this location')).toBeTruthy();
    expect(screen.getByText('Use at most 300 characters')).toBeTruthy();
    expect(api.createLocation).not.toHaveBeenCalled();
  });

  it('says a location that is not in the list was not found', async () => {
    await renderForm('loc-gone');
    expect(await screen.findByText('Location not found')).toBeTruthy();
  });
});
