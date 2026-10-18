import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Linking } from 'react-native';
import { useNetworkStore } from '../../state/networkStore';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import * as service from '../services/inventoryService';
import type { MockedInventoryApi } from '../testUtils/api';
import { apiError } from '../testUtils/fixtures';
import { ExportButton } from './ExportButton';

// The export decision (B5): the server writes the CSV to the dealer's private folder and returns a short-lived signed
// link, which the phone opens with Linking; no new native module, nothing kept on the phone.

jest.mock('../services/inventoryService');

const api = service as MockedInventoryApi;
const SIGNED = 'http://127.0.0.1:54321/storage/v1/object/sign/inventory-exports/dealer-a/stock-summary.csv?token=abc';
let openURL: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  api.createExport.mockResolvedValue({ url: SIGNED, expires_at: '2026-10-18T09:10:00Z' });
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});

afterEach(() => {
  openURL.mockRestore();
  useNetworkStore.getState().setOffline(false);
});

describe('ExportButton', () => {
  it('asks for the report over the chosen days, as dates, and opens the signed link', async () => {
    await renderWithQuery(<ExportButton report="stock-summary" range={{ from: '2026-10-01', to: '2026-10-31' }} />);
    await fireEvent.press(screen.getByText('Export CSV'));
    await waitFor(() =>
      expect(api.createExport).toHaveBeenCalledWith({ report: 'stock-summary', from: '2026-10-01', to: '2026-10-31' }),
    );
    expect(openURL).toHaveBeenCalledWith(SIGNED);
    expect(await screen.findByText('Your file is ready. The link works for 10 minutes.')).toBeTruthy();
  });

  it('exports reconciliation with no period (it covers all time)', async () => {
    await renderWithQuery(<ExportButton report="reconciliation" />);
    await fireEvent.press(screen.getByText('Export CSV'));
    await waitFor(() => expect(api.createExport).toHaveBeenCalledWith({ report: 'reconciliation', from: null, to: null }));
  });

  it('makes a new link on every press, so an expired one is never reopened', async () => {
    await renderWithQuery(<ExportButton report="valuation" range={{ from: '2026-10-01', to: '2026-10-31' }} />);
    await fireEvent.press(screen.getByText('Export CSV'));
    await waitFor(() => expect(openURL).toHaveBeenCalledTimes(1));
    await fireEvent.press(screen.getByText('Export CSV'));
    await waitFor(() => expect(api.createExport).toHaveBeenCalledTimes(2));
  });

  it('says the file could not be opened, not the system error, when the phone cannot open the link', async () => {
    openURL.mockRejectedValueOnce(new Error('No Activity found to handle Intent'));
    await renderWithQuery(<ExportButton report="stock-summary" range={{ from: '2026-10-01', to: '2026-10-31' }} />);
    await fireEvent.press(screen.getByText('Export CSV'));
    expect(
      await screen.findByText("The file was made but this phone couldn't open it. Export it again to get a new link."),
    ).toBeTruthy();
    expect(screen.queryByText(/No Activity found/)).toBeNull();
  });

  it('shows the server’s refusal in plain words and opens nothing', async () => {
    api.createExport.mockRejectedValueOnce(apiError(503, 'service_unavailable', 'Exports are unavailable'));
    await renderWithQuery(<ExportButton report="stock-summary" range={{ from: '2026-10-01', to: '2026-10-31' }} />);
    await fireEvent.press(screen.getByText('Export CSV'));
    expect(await screen.findByText('The service is not available right now. Please try again shortly.')).toBeTruthy();
    expect(openURL).not.toHaveBeenCalled();
  });

  it('is refused offline with a message, and nothing is sent', async () => {
    useNetworkStore.getState().setOffline(true);
    await renderWithQuery(<ExportButton report="stock-summary" range={{ from: '2026-10-01', to: '2026-10-31' }} />);
    await fireEvent.press(screen.getByText('Export CSV'));
    expect(await screen.findByText("You're offline. Connect to the internet to export this report.")).toBeTruthy();
    expect(api.createExport).not.toHaveBeenCalled();
    expect(openURL).not.toHaveBeenCalled();
  });
});
