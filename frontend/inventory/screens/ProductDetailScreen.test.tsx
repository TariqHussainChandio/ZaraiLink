import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { renderWithProviders } from '../../testUtils/renderWithProviders';
import * as service from '../services/inventoryService';
import { answerReads, lastByText, type MockedInventoryApi } from '../testUtils/api';
import { apiError, movement, product, screenProps, signInApprovedDealer } from '../testUtils/fixtures';
import { INVENTORY_ROUTES } from '../types/navigation';
import { ProductDetailScreen } from './ProductDetailScreen';

jest.mock('../services/inventoryService');

const api = service as MockedInventoryApi;
const navigate = jest.fn();

async function renderDetail() {
  await renderWithProviders(
    <ProductDetailScreen
      {...screenProps<typeof INVENTORY_ROUTES.ProductDetail>({ productId: 'prod-urea' }, { navigate })}
    />,
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  answerReads(api);
  await signInApprovedDealer();
});

describe('ProductDetailScreen', () => {
  it('shows the product, its stock at each location (the default one marked) and prices', async () => {
    api.fetchProduct.mockResolvedValue(
      product({
        total_quantity: 26,
        default_location_quantity: 20,
        stock: [
          { location_id: 'loc-shop', quantity: 20 },
          { location_id: 'loc-godown', quantity: 6 },
        ],
      }),
    );
    await renderDetail();
    expect(await screen.findByText('SKU UREA-50')).toBeTruthy();
    expect(screen.getByText('26 bag')).toBeTruthy();
    expect(screen.getByText('20 bag at the default location, the stock the marketplace sells and alerts watch')).toBeTruthy();
    expect(await screen.findByText('Main shop')).toBeTruthy();
    expect(screen.getByText('Default · sold on the marketplace')).toBeTruthy();
    expect(screen.getByText('Back godown')).toBeTruthy();
    expect(screen.getByText(/^Reorder at 5 bag · Cost Rs/)).toBeTruthy();
  });

  it('shows the default location’s status, so it agrees with the alert centre (F3)', async () => {
    api.fetchProduct.mockResolvedValue(product({ total_quantity: 20, default_location_quantity: 0 }));
    await renderDetail();
    expect(await screen.findByText('Out of stock')).toBeTruthy();
    expect(screen.getByText('0 bag at the default location, the stock the marketplace sells and alerts watch')).toBeTruthy();
  });

  it('shows its movement history and opens the full, filtered history', async () => {
    api.fetchMovements.mockResolvedValue([movement(), movement({ id: 'm2', direction: 'out', source: 'LOCAL_SALE', quantity: 2 })]);
    await renderDetail();
    expect(await screen.findByText('−2')).toBeTruthy();
    expect(api.fetchMovements).toHaveBeenCalledWith({ productId: 'prod-urea' });
    await fireEvent.press(screen.getByText('All'));
    expect(navigate).toHaveBeenCalledWith(INVENTORY_ROUTES.Movements, { productId: 'prod-urea' });
  });

  it('starts each operation on this product', async () => {
    await renderDetail();
    await fireEvent.press(await screen.findByRole('button', { name: 'Stock out' }));
    expect(navigate).toHaveBeenCalledWith(INVENTORY_ROUTES.Operation, { operation: 'out', productId: 'prod-urea' });
  });

  it('links one of the dealer’s listings (D8) and confirms with a toast', async () => {
    api.linkListing.mockResolvedValue(product({ listings: [{ id: 'listing-urea', title: 'Urea bags, Multan' }] }));
    await renderDetail();
    expect(await screen.findByText('Not linked to a listing.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Link a listing'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Your listing, Choose a listing' }));
    await fireEvent.press(await screen.findByText('Urea bags, Multan'));
    await fireEvent.press(screen.getByText('Link'));
    await waitFor(() => expect(api.linkListing).toHaveBeenCalledWith('prod-urea', 'listing-urea'));
    expect(await screen.findByText('Listing linked')).toBeTruthy();
  });

  it('shows a listing linked to another product as the API words it', async () => {
    api.linkListing.mockRejectedValue(apiError(409, 'conflict', 'This listing is already linked to another product'));
    await renderDetail();
    await fireEvent.press(await screen.findByText('Link a listing'));
    await fireEvent.press(await screen.findByRole('button', { name: 'Your listing, Choose a listing' }));
    await fireEvent.press(await screen.findByText('Urea bags, Multan'));
    await fireEvent.press(screen.getByText('Link'));
    expect(await screen.findByText('This listing is already linked to another product')).toBeTruthy();
  });

  it('asks in a sheet before unlinking, and unlinks only on confirm', async () => {
    api.fetchProduct.mockResolvedValue(product({ listings: [{ id: 'listing-urea', title: 'Urea bags, Multan' }] }));
    api.unlinkListing.mockResolvedValue(undefined);
    await renderDetail();
    await fireEvent.press(await screen.findByLabelText('Unlink Urea bags, Multan'));
    expect(screen.getByText('Unlink this listing?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Not now'));
    expect(api.unlinkListing).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText('Unlink Urea bags, Multan'));
    await fireEvent.press(lastByText('Unlink'));
    await waitFor(() => expect(api.unlinkListing).toHaveBeenCalledWith('prod-urea', 'listing-urea'));
    expect(await screen.findByText('Listing unlinked')).toBeTruthy();
  });

  it('shows a load failure with Retry', async () => {
    api.fetchProduct.mockRejectedValueOnce(apiError(404, 'not_found', 'Product not found'));
    await renderDetail();
    expect(await screen.findByText("Couldn't load this product")).toBeTruthy();
    expect(screen.getByText('We could not find what you were looking for.')).toBeTruthy();
  });
});
