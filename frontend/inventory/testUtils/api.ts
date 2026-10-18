import { screen } from '@testing-library/react-native';
import type * as service from '../services/inventoryService';
import {
  alert,
  alertSettings,
  dashboard,
  godown,
  location,
  movement,
  product,
  purchase,
  stockLevel,
  supplier,
  syncEntry,
} from './fixtures';

/** The inventory service as each screen test mocks it (`jest.mock('../services/inventoryService')`). */
export type MockedInventoryApi = jest.Mocked<typeof service>;

/**
 * A dealer with one product, a shop (the default) and a godown, one movement, a draft purchase and a supplier: every
 * read answers, so a screen under test sees what it would on a device. A test overrides the read it is about.
 */
export function answerReads(api: MockedInventoryApi): void {
  api.fetchDashboard.mockResolvedValue(dashboard());
  api.fetchProducts.mockResolvedValue([product()]);
  api.fetchProduct.mockResolvedValue(product());
  api.fetchListingOptions.mockResolvedValue([{ id: 'listing-urea', title: 'Urea bags, Multan' }]);
  api.fetchStock.mockResolvedValue([stockLevel()]);
  api.fetchLocations.mockResolvedValue([location(), godown()]);
  api.fetchMovements.mockResolvedValue([movement()]);
  api.fetchSuppliers.mockResolvedValue([supplier()]);
  api.fetchPurchases.mockResolvedValue([purchase()]);
  api.fetchPurchase.mockResolvedValue(purchase());
  api.fetchAlerts.mockResolvedValue([alert()]);
  api.fetchAlertSettings.mockResolvedValue(alertSettings());
  api.fetchSyncLog.mockResolvedValue([syncEntry()]);
}

/** The last element with this text: a sheet's button renders after the screen's button of the same name. */
export function lastByText(text: string) {
  const matches = screen.getAllByText(text);
  const last = matches[matches.length - 1];
  if (!last) throw new Error(`No "${text}"`);
  return last;
}
