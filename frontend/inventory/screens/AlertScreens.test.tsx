import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { renderWithProviders } from '../../testUtils/renderWithProviders';
import * as service from '../services/inventoryService';
import { answerReads, type MockedInventoryApi } from '../testUtils/api';
import { alert, alertSettings, apiError, screenProps, signInApprovedDealer } from '../testUtils/fixtures';
import { INVENTORY_ROUTES } from '../types/navigation';
import { AlertSettingsScreen } from './AlertSettingsScreen';
import { AlertsScreen } from './AlertsScreen';

jest.mock('../services/inventoryService');

const api = service as MockedInventoryApi;
const navigation = { navigate: jest.fn(), goBack: jest.fn() };

async function renderAlerts() {
  await renderWithProviders(<AlertsScreen {...screenProps<typeof INVENTORY_ROUTES.Alerts>(undefined, navigation)} />);
}

async function renderSettings() {
  await renderWithProviders(<AlertSettingsScreen {...screenProps<typeof INVENTORY_ROUTES.AlertSettings>(undefined, navigation)} />);
}

beforeEach(async () => {
  jest.clearAllMocks();
  answerReads(api);
  await signInApprovedDealer();
});

describe('AlertsScreen (SRDS §24)', () => {
  it('lists out-of-stock products first, then low ones, with location and reorder level', async () => {
    api.fetchAlerts.mockResolvedValue([
      alert(),
      alert({ product_id: 'prod-zinc', name: 'Zinc 10kg', sku: 'ZN-10', quantity: 0, status: 'out_of_stock', location_id: 'loc-godown' }),
    ]);
    await renderAlerts();
    expect(await screen.findByText('ZN-10 · Back godown · 0 bag left · reorder at 5')).toBeTruthy();
    const names = screen.getAllByText(/^(Zinc 10kg|DAP 50kg)$/).map(node => node.props.children);
    expect(names).toEqual(['Zinc 10kg', 'DAP 50kg']);
    await fireEvent.press(screen.getByText('DAP 50kg'));
    expect(navigation.navigate).toHaveBeenCalledWith(INVENTORY_ROUTES.ProductDetail, { productId: 'prod-dap' });
  });

  it('says when every product is above its level', async () => {
    api.fetchAlerts.mockResolvedValue([]);
    await renderAlerts();
    expect(await screen.findByText('No stock alerts')).toBeTruthy();
    await fireEvent.press(screen.getByText('Alert settings'));
    expect(navigation.navigate).toHaveBeenCalledWith(INVENTORY_ROUTES.AlertSettings);
  });

  it('shows a failed load with Retry', async () => {
    api.fetchAlerts.mockRejectedValueOnce(apiError(503, 'service_unavailable', 'down'));
    await renderAlerts();
    expect(await screen.findByText("Couldn't load the alerts")).toBeTruthy();
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('DAP 50kg')).toBeTruthy();
  });
});

describe('AlertSettingsScreen', () => {
  it('starts from the saved settings and saves the threshold and both notifications', async () => {
    api.fetchAlertSettings.mockResolvedValue(alertSettings({ default_reorder_threshold: 5, notify_sync_failure: true }));
    api.saveAlertSettings.mockResolvedValue(alertSettings());
    await renderSettings();
    const field = await screen.findByLabelText('Default reorder threshold');
    expect(screen.getByDisplayValue('5')).toBeTruthy();
    await fireEvent.changeText(field, '7.5');
    await fireEvent(screen.getByRole('switch', { name: 'Marketplace sync failures' }), 'valueChange', false);
    await fireEvent.press(screen.getByText('Save settings'));
    await waitFor(() =>
      expect(api.saveAlertSettings).toHaveBeenCalledWith({
        default_reorder_threshold: 7.5,
        notify_low_stock: true,
        notify_sync_failure: false,
      }),
    );
    expect(await screen.findByText('Alert settings saved')).toBeTruthy();
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('refuses an empty or three-decimal threshold', async () => {
    await renderSettings();
    const field = await screen.findByLabelText('Default reorder threshold');
    await fireEvent.changeText(field, '');
    await fireEvent.press(screen.getByText('Save settings'));
    expect(await screen.findByText('Enter a number, such as 10')).toBeTruthy();
    await fireEvent.changeText(field, '1.255');
    await fireEvent.press(screen.getByText('Save settings'));
    expect(screen.getByText('Enter a number, such as 10')).toBeTruthy();
    expect(api.saveAlertSettings).not.toHaveBeenCalled();
  });

  it('shows a refused save on the screen', async () => {
    api.saveAlertSettings.mockRejectedValue(apiError(0, 'network', 'offline'));
    await renderSettings();
    await fireEvent.press(await screen.findByText('Save settings'));
    expect(await screen.findByText('No internet connection. Check your connection and try again.')).toBeTruthy();
  });

  it('shows a failed load with Retry', async () => {
    api.fetchAlertSettings.mockRejectedValueOnce(apiError(503, 'service_unavailable', 'down'));
    await renderSettings();
    expect(await screen.findByText("Couldn't load your alert settings")).toBeTruthy();
  });
});
