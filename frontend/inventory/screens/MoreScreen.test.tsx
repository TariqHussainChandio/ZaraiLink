import { fireEvent, screen } from '@testing-library/react-native';
import React from 'react';
import { renderWithProviders } from '../../testUtils/renderWithProviders';
import { InventoryExitProvider } from '../components/InventoryExit';
import { screenProps } from '../testUtils/fixtures';
import { INVENTORY_ROUTES } from '../types/navigation';
import { MoreScreen } from './MoreScreen';

const navigate = jest.fn();
const exit = jest.fn();

beforeEach(() => jest.clearAllMocks());

describe('MoreScreen', () => {
  it.each([
    ['Purchases', INVENTORY_ROUTES.Purchases],
    ['Suppliers', INVENTORY_ROUTES.Suppliers],
    ['Locations', INVENTORY_ROUTES.Locations],
    ['Alert settings', INVENTORY_ROUTES.AlertSettings],
    ['Activity history', INVENTORY_ROUTES.Movements],
    ['Marketplace sync', INVENTORY_ROUTES.SyncLog],
    ['Reconciliation', INVENTORY_ROUTES.Reconciliation],
  ])('opens %s', async (title, route) => {
    await renderWithProviders(
      <InventoryExitProvider onExit={exit}>
        <MoreScreen {...screenProps<typeof INVENTORY_ROUTES.More>(undefined, { navigate })} />
      </InventoryExitProvider>,
    );
    await fireEvent.press(screen.getByText(title));
    expect(navigate).toHaveBeenCalledWith(route);
  });

  it('leaves the whole inventory system with "Back to ZaraiLink"', async () => {
    await renderWithProviders(
      <InventoryExitProvider onExit={exit}>
        <MoreScreen {...screenProps<typeof INVENTORY_ROUTES.More>(undefined, { navigate })} />
      </InventoryExitProvider>,
    );
    await fireEvent.press(screen.getByText('Back to ZaraiLink'));
    expect(exit).toHaveBeenCalledTimes(1);
  });
});
