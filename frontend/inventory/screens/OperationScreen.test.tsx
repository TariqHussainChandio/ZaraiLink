import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { renderWithProviders } from '../../testUtils/renderWithProviders';
import * as service from '../services/inventoryService';
import { answerReads, type MockedInventoryApi } from '../testUtils/api';
import {
  apiError,
  movement,
  product,
  screenProps,
  signInApprovedDealer,
} from '../testUtils/fixtures';
import type { StockOperation } from '../types/inventory';
import { INVENTORY_ROUTES } from '../types/navigation';
import { OperationScreen } from './OperationScreen';

jest.mock('../services/inventoryService');

const api = service as MockedInventoryApi;
/** Every stock write carries its form entry's Idempotency-Key (hooks/entryKey.ts). */
const ENTRY_KEY = expect.stringMatching(/^zl-[0-9a-f-]{36}$/);
const navigation = { navigate: jest.fn(), goBack: jest.fn() };

async function renderOperation(
  operation: StockOperation,
  productId: string | undefined = 'prod-urea',
) {
  await renderWithProviders(
    <OperationScreen
      {...screenProps<typeof INVENTORY_ROUTES.Operation>(
        { operation, productId },
        navigation,
      )}
    />,
  );
  // The location starts at the app bar's choice once the locations load, and the stock line follows.
  await screen.findByText('In stock here: 20 bag');
}

beforeEach(async () => {
  jest.clearAllMocks();
  answerReads(api);
  api.postStockIn.mockResolvedValue(movement());
  api.postStockOut.mockResolvedValue(movement({ direction: 'out' }));
  api.postAdjustment.mockResolvedValue(movement());
  api.postTransfer.mockResolvedValue([movement(), movement({ id: 'm2' })]);
  await signInApprovedDealer();
});

describe('OperationScreen: Stock In', () => {
  it('records a restock at the chosen location and goes back with a toast', async () => {
    await renderOperation('in');
    await fireEvent.changeText(screen.getByLabelText('Quantity'), '12.5');
    await fireEvent.changeText(
      screen.getByLabelText('Note'),
      'From the Multan depot',
    );
    await fireEvent.press(screen.getByText('Save stock in'));
    await waitFor(() =>
      expect(api.postStockIn).toHaveBeenCalledWith(
        {
          product_id: 'prod-urea',
          location_id: 'loc-shop',
          quantity: 12.5,
          reason: 'From the Multan depot',
        },
        ENTRY_KEY,
      ),
    );
    expect(await screen.findByText('Stock in saved')).toBeTruthy();
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('counts with the stepper and never below zero', async () => {
    await renderOperation('in');
    expect(screen.getByLabelText('Decrease quantity')).toBeDisabled();
    await fireEvent.press(screen.getByLabelText('Increase quantity'));
    await fireEvent.press(screen.getByLabelText('Increase quantity'));
    expect(screen.getByDisplayValue('2')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Decrease quantity'));
    expect(screen.getByDisplayValue('1')).toBeTruthy();
  });

  it('refuses zero, a third decimal and a product not chosen', async () => {
    await renderWithProviders(
      <OperationScreen
        {...screenProps<typeof INVENTORY_ROUTES.Operation>(
          { operation: 'in' },
          navigation,
        )}
      />,
    );
    await fireEvent.changeText(
      await screen.findByLabelText('Quantity'),
      '1.234',
    );
    await fireEvent.press(screen.getByText('Save stock in'));
    expect(
      await screen.findByText(
        'Enter a quantity above zero, with at most two decimals',
      ),
    ).toBeTruthy();
    // The placeholder and the error share the words, so the error is the second copy.
    expect(screen.getAllByText('Choose a product')).toHaveLength(2);
    expect(api.postStockIn).not.toHaveBeenCalled();
  });
});

describe('OperationScreen: Stock Out', () => {
  it('lays all five reasons out in a wrapping row, none in a sideways scroll (F8)', async () => {
    await renderOperation('out');
    for (const label of [
      'Local sale',
      'Damage',
      'Expiry',
      'Own use',
      'Other',
    ]) {
      const chip = screen.getByRole('button', { name: label });
      // The form itself scrolls up and down; what hid the chips was a sideways (horizontal) scroll around them.
      let node = chip.parent;
      while (node && !node.props.horizontal) node = node.parent;
      expect(node).toBeNull();
    }
  });

  it.each([
    ['Local sale', 'LOCAL_SALE', null],
    ['Damage', 'DAMAGE', null],
    ['Expiry', 'EXPIRY', null],
    ['Own use', 'OTHER', 'Own use'],
  ])('records "%s" with source %s', async (label, source, reason) => {
    await renderOperation('out');
    await fireEvent.press(screen.getByText(label));
    await fireEvent.changeText(screen.getByLabelText('Quantity'), '3');
    await fireEvent.press(screen.getByText('Save stock out'));
    await waitFor(() =>
      expect(api.postStockOut).toHaveBeenCalledWith(
        {
          product_id: 'prod-urea',
          location_id: 'loc-shop',
          quantity: 3,
          source,
          reason,
        },
        ENTRY_KEY,
      ),
    );
  });

  it('keeps the note after "Own use:" so the ledger says why', async () => {
    await renderOperation('out');
    await fireEvent.press(screen.getByText('Own use'));
    await fireEvent.changeText(screen.getByLabelText('Quantity'), '1');
    await fireEvent.changeText(screen.getByLabelText('Note'), 'for the farm');
    await fireEvent.press(screen.getByText('Save stock out'));
    await waitFor(() =>
      expect(api.postStockOut).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'Own use: for the farm' }),
        ENTRY_KEY,
      ),
    );
  });

  it('shows a shortage in the stock function’s own words and stays on the form', async () => {
    api.postStockOut.mockRejectedValue(
      apiError(422, 'insufficient_stock', 'Only 20 in stock at this location'),
    );
    await renderOperation('out');
    await fireEvent.changeText(screen.getByLabelText('Quantity'), '25');
    await fireEvent.press(screen.getByText('Save stock out'));
    expect(
      await screen.findByText('Only 20 in stock at this location'),
    ).toBeTruthy();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});

// B4 verification F2: a write whose answer was lost may have been saved. The screen must not say "not saved", and a
// second press, even after the dealer changes the note, must carry the same key so the server records it once.
describe('OperationScreen: a lost response', () => {
  it('says the save could not be confirmed, and the retry with a changed note keeps the entry’s key', async () => {
    api.postStockOut.mockRejectedValueOnce(
      apiError(0, 'network', 'No connection to the server'),
    );
    await renderOperation('out');
    await fireEvent.changeText(screen.getByLabelText('Quantity'), '3');
    await fireEvent.press(screen.getByText('Save stock out'));
    expect(
      await screen.findByText(
        "We couldn't confirm this was saved. Check Activity history before entering it again.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText("You're offline — this change wasn't saved."),
    ).toBeNull();
    // The title agrees with the body: the server may have saved it (B4 re-verification N1).
    expect(screen.getByText('Not confirmed')).toBeTruthy();
    expect(screen.queryByText('Not saved')).toBeNull();

    await fireEvent.changeText(
      screen.getByLabelText('Note'),
      'walk-in customer',
    );
    await fireEvent.press(screen.getByText('Save stock out'));
    await waitFor(() => expect(api.postStockOut).toHaveBeenCalledTimes(2));
    const [first, second] = api.postStockOut.mock.calls;
    expect(second?.[0].reason).toBe('walk-in customer');
    expect(second?.[1]).toBe(first?.[1]);
    expect(await screen.findByText('Stock out saved')).toBeTruthy();
  });

  it('a timeout is unconfirmed too', async () => {
    api.postStockIn.mockRejectedValueOnce(
      apiError(0, 'timeout', 'The request timed out'),
    );
    await renderOperation('in');
    await fireEvent.changeText(screen.getByLabelText('Quantity'), '2');
    await fireEvent.press(screen.getByText('Save stock in'));
    expect(
      await screen.findByText(
        "We couldn't confirm this was saved. Check Activity history before entering it again.",
      ),
    ).toBeTruthy();
  });

  it('says so when the server already has this entry with other details (idempotency_key_reused)', async () => {
    api.postStockIn.mockRejectedValueOnce(
      apiError(422, 'idempotency_key_reused', 'Idempotency key reused'),
    );
    await renderOperation('in');
    await fireEvent.changeText(screen.getByLabelText('Quantity'), '2');
    await fireEvent.press(screen.getByText('Save stock in'));
    expect(
      await screen.findByText(
        'This entry was already sent with different details; check Activity history.',
      ),
    ).toBeTruthy();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});

describe('OperationScreen: Adjustment', () => {
  it('requires a reason', async () => {
    await renderOperation('adjust');
    await fireEvent.changeText(screen.getByLabelText('Quantity'), '2');
    await fireEvent.press(screen.getByText('Save adjustment'));
    expect(
      await screen.findByText('Say why the stock is being corrected'),
    ).toBeTruthy();
    expect(api.postAdjustment).not.toHaveBeenCalled();
  });

  it('records a correction down with its reason', async () => {
    await renderOperation('adjust');
    await fireEvent.press(screen.getByText('Take from stock'));
    await fireEvent.changeText(screen.getByLabelText('Quantity'), '2');
    await fireEvent.changeText(
      screen.getByLabelText('Reason'),
      'Counted 18 on the shelf',
    );
    await fireEvent.press(screen.getByText('Save adjustment'));
    await waitFor(() =>
      expect(api.postAdjustment).toHaveBeenCalledWith(
        {
          product_id: 'prod-urea',
          location_id: 'loc-shop',
          quantity: 2,
          direction: 'out',
          reason: 'Counted 18 on the shelf',
        },
        ENTRY_KEY,
      ),
    );
  });

  it('refuses a reason over the API’s 1000 characters', async () => {
    await renderOperation('adjust');
    await fireEvent.changeText(screen.getByLabelText('Quantity'), '2');
    await fireEvent.changeText(
      screen.getByLabelText('Reason'),
      'x'.repeat(1001),
    );
    await fireEvent.press(screen.getByText('Save adjustment'));
    expect(await screen.findByText('Use at most 1000 characters')).toBeTruthy();
  });
});

describe('OperationScreen: Transfer', () => {
  it('moves stock to another location', async () => {
    await renderOperation('transfer');
    await fireEvent.press(
      screen.getByRole('button', { name: 'To location, Choose where it goes' }),
    );
    await fireEvent.press(await screen.findByText('Back godown'));
    await fireEvent.changeText(screen.getByLabelText('Quantity'), '5');
    await fireEvent.press(screen.getByText('Save transfer'));
    await waitFor(() =>
      expect(api.postTransfer).toHaveBeenCalledWith(
        {
          product_id: 'prod-urea',
          from_location_id: 'loc-shop',
          to_location_id: 'loc-godown',
          quantity: 5,
          reason: null,
        },
        ENTRY_KEY,
      ),
    );
    expect(await screen.findByText('Transfer saved')).toBeTruthy();
  });

  it('asks where it goes', async () => {
    await renderOperation('transfer');
    await fireEvent.changeText(screen.getByLabelText('Quantity'), '5');
    await fireEvent.press(screen.getByText('Save transfer'));
    await waitFor(() =>
      expect(screen.getAllByText('Choose where it goes')).toHaveLength(2),
    );
    expect(api.postTransfer).not.toHaveBeenCalled();
  });

  it('offers only active products and the other locations', async () => {
    api.fetchProducts.mockResolvedValue([
      product(),
      product({ id: 'p-old', name: 'Old', sku: 'OLD', is_active: false }),
    ]);
    await renderOperation('transfer');
    await fireEvent.press(
      screen.getByRole('button', { name: 'Product, Urea 50kg (UREA-50)' }),
    );
    expect(screen.queryByText('Old (OLD)')).toBeNull();
  });
});
