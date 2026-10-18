import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { View } from 'react-native';
import { OfflineBanner } from '../../common/components';
import { useNetworkStore } from '../../state/networkStore';
import { createTestQueryClient, renderWithProviders } from '../../testUtils/renderWithProviders';
import { inventoryKeys } from '../hooks/keys';
import * as service from '../services/inventoryService';
import { answerReads, type MockedInventoryApi } from '../testUtils/api';
import { apiError, dashboard, godown, location, product, screenProps, signInApprovedDealer } from '../testUtils/fixtures';
import { INVENTORY_ROUTES } from '../types/navigation';
import { DashboardScreen } from './DashboardScreen';
import { OperationScreen } from './OperationScreen';
import { ProductListScreen } from './ProductListScreen';

// The B4 rule (maintainer, 2026-10-11): offline, the inventory system shows the copy kept on the phone under the
// offline banner, and a write fails at once and says so; nothing is queued.

jest.mock('../services/inventoryService');

const api = service as MockedInventoryApi;
const offline = apiError(0, 'network', 'No connection to the server');

/** A query client holding what the dealer last saw, as PersistQueryClientProvider restores it on a cold start. */
function cachedClient() {
  const client = createTestQueryClient();
  client.setQueryData(inventoryKeys.dashboard(), dashboard());
  client.setQueryData(inventoryKeys.products(), [product()]);
  client.setQueryData(inventoryKeys.locations(), [location(), godown()]);
  client.setQueryData(inventoryKeys.product('prod-urea'), product());
  return client;
}

beforeEach(async () => {
  jest.clearAllMocks();
  answerReads(api);
  // Every read fails as it does with no connection; the cached copy is all there is.
  for (const read of [api.fetchDashboard, api.fetchProducts, api.fetchLocations, api.fetchProduct, api.fetchMovements]) {
    read.mockRejectedValue(offline);
  }
  useNetworkStore.getState().setOffline(true);
  await signInApprovedDealer();
});

afterEach(() => useNetworkStore.getState().setOffline(false));

describe('the inventory system offline', () => {
  it('shows the cached dashboard under the offline banner, without a second error banner', async () => {
    await renderWithProviders(
      <View>
        <OfflineBanner />
        <DashboardScreen {...screenProps<typeof INVENTORY_ROUTES.Dashboard>(undefined, { navigate: jest.fn() })} />
      </View>,
      cachedClient(),
    );
    expect(screen.getByText('You are offline')).toBeTruthy();
    expect(await screen.findByLabelText('Products: 3')).toBeTruthy();
    expect(screen.queryByText("Couldn't load your inventory")).toBeNull();
  });

  it('shows the cached product list, not an error', async () => {
    await renderWithProviders(
      <ProductListScreen {...screenProps<typeof INVENTORY_ROUTES.Products>(undefined, { navigate: jest.fn() })} />,
      cachedClient(),
    );
    expect(await screen.findByText('Urea 50kg')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Couldn't load your products")).toBeNull());
  });

  it('refuses a stock write at once, says so, and sends nothing', async () => {
    const navigation = { goBack: jest.fn(), navigate: jest.fn() };
    await renderWithProviders(
      <OperationScreen
        {...screenProps<typeof INVENTORY_ROUTES.Operation>({ operation: 'out', productId: 'prod-urea' }, navigation)}
      />,
      cachedClient(),
    );
    await screen.findByText('In stock here: 20 bag');
    await fireEvent.changeText(screen.getByLabelText('Quantity'), '2');
    await fireEvent.press(screen.getByText('Save stock out'));
    expect(await screen.findByText("You're offline — this change wasn't saved.")).toBeTruthy();
    expect(api.postStockOut).not.toHaveBeenCalled();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});
