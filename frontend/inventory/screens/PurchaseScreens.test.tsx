import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { renderWithProviders } from '../../testUtils/renderWithProviders';
import * as service from '../services/inventoryService';
import { answerReads, lastByText, type MockedInventoryApi } from '../testUtils/api';
import { apiError, purchase, screenProps, signInApprovedDealer } from '../testUtils/fixtures';
import { INVENTORY_ROUTES } from '../types/navigation';
import { PurchaseDetailScreen } from './PurchaseDetailScreen';
import { PurchaseFormScreen } from './PurchaseFormScreen';
import { PurchaseListScreen } from './PurchaseListScreen';

jest.mock('../services/inventoryService');

const api = service as MockedInventoryApi;
const navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };

async function renderDetail() {
  await renderWithProviders(
    <PurchaseDetailScreen {...screenProps<typeof INVENTORY_ROUTES.PurchaseDetail>({ purchaseId: 'pur-1' }, navigation)} />,
  );
}

async function renderForm(purchaseId?: string) {
  await renderWithProviders(
    <PurchaseFormScreen {...screenProps<typeof INVENTORY_ROUTES.PurchaseForm>(purchaseId ? { purchaseId } : undefined, navigation)} />,
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  answerReads(api);
  await signInApprovedDealer();
});

describe('PurchaseListScreen', () => {
  it('lists purchases with supplier, date, lines and status, and filters by status on the server', async () => {
    api.fetchPurchases.mockResolvedValue([purchase(), purchase({ id: 'pur-2', reference: null, status: 'received' })]);
    await renderWithProviders(<PurchaseListScreen {...screenProps<typeof INVENTORY_ROUTES.Purchases>(undefined, navigation)} />);
    expect(await screen.findByText('INV-778')).toBeTruthy();
    // A purchase with no reference is named by its supplier.
    expect(await screen.findAllByText('Engro Fertilizers')).toHaveLength(1);
    expect(screen.getAllByText(/Engro Fertilizers · 1 lines$/)).toHaveLength(2);
    expect(api.fetchPurchases).toHaveBeenLastCalledWith(undefined);
    await fireEvent.press(screen.getByRole('button', { name: 'Received' }));
    await waitFor(() => expect(api.fetchPurchases).toHaveBeenLastCalledWith('received'));
    await fireEvent.press(await screen.findByText('INV-778'));
    expect(navigation.navigate).toHaveBeenCalledWith(INVENTORY_ROUTES.PurchaseDetail, { purchaseId: 'pur-1' });
  });

  it('explains purchases when there are none, and opens a new one', async () => {
    api.fetchPurchases.mockResolvedValue([]);
    await renderWithProviders(<PurchaseListScreen {...screenProps<typeof INVENTORY_ROUTES.Purchases>(undefined, navigation)} />);
    expect(await screen.findByText('No purchases')).toBeTruthy();
    await fireEvent.press(screen.getByText('New purchase'));
    expect(navigation.navigate).toHaveBeenCalledWith(INVENTORY_ROUTES.PurchaseForm);
  });

  it('shows a failed load with Retry', async () => {
    api.fetchPurchases.mockRejectedValueOnce(apiError(503, 'service_unavailable', 'down'));
    await renderWithProviders(<PurchaseListScreen {...screenProps<typeof INVENTORY_ROUTES.Purchases>(undefined, navigation)} />);
    expect(await screen.findByText("Couldn't load your purchases")).toBeTruthy();
  });
});

describe('PurchaseFormScreen', () => {
  it('saves a new draft with its lines and opens it', async () => {
    api.createPurchase.mockResolvedValue(purchase({ id: 'pur-new' }));
    await renderForm();
    // The pickers open once their lists have loaded.
    const supplierField = await screen.findByRole('button', { name: 'Supplier, No supplier' });
    await waitFor(() => expect(supplierField).toBeEnabled());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Product, Choose a product' })).toBeEnabled());
    await fireEvent.press(supplierField);
    await fireEvent.press(await screen.findByText('Engro Fertilizers'));
    await fireEvent.changeText(screen.getByLabelText('Reference'), 'INV-901');
    await fireEvent.press(screen.getByRole('button', { name: 'Product, Choose a product' }));
    await fireEvent.press(await screen.findByText('Urea 50kg (UREA-50)'));
    await fireEvent.changeText(screen.getByLabelText('Quantity'), '40');
    await fireEvent.changeText(screen.getByLabelText('Unit cost'), '3100');
    await fireEvent.press(screen.getByText('Save draft'));
    await waitFor(() =>
      expect(api.createPurchase).toHaveBeenCalledWith({
        supplier_id: 'sup-1',
        reference: 'INV-901',
        notes: null,
        items: [{ product_id: 'prod-urea', location_id: 'loc-shop', quantity: 40, unit_cost: 3100 }],
      }, expect.stringMatching(/^zl-/)),
    );
    expect(await screen.findByText('Purchase saved as a draft')).toBeTruthy();
    expect(navigation.replace).toHaveBeenCalledWith(INVENTORY_ROUTES.PurchaseDetail, { purchaseId: 'pur-new' });
  });

  it('a lost response on a new purchase is unconfirmed, not "not saved" (F2)', async () => {
    api.createPurchase.mockRejectedValueOnce(apiError(0, 'network', 'No connection to the server'));
    await renderForm();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Product, Choose a product' })).toBeEnabled());
    await fireEvent.press(screen.getByRole('button', { name: 'Product, Choose a product' }));
    await fireEvent.press(await screen.findByText('Urea 50kg (UREA-50)'));
    await fireEvent.changeText(screen.getByLabelText('Quantity'), '4');
    await fireEvent.press(screen.getByText('Save draft'));
    expect(
      await screen.findByText("We couldn't confirm this was saved. Check Activity history before entering it again."),
    ).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Reference'), 'INV-1');
    await fireEvent.press(screen.getByText('Save draft'));
    await waitFor(() => expect(api.createPurchase).toHaveBeenCalledTimes(2));
    const [first, second] = api.createPurchase.mock.calls;
    expect(second?.[1]).toBe(first?.[1]);
  });

  it('validates each line and the reference length', async () => {
    await renderForm();
    await fireEvent.changeText(await screen.findByLabelText('Reference'), 'r'.repeat(81));
    await fireEvent.changeText(screen.getByLabelText('Unit cost'), '1.999');
    await fireEvent.press(screen.getByText('Save draft'));
    expect(await screen.findByText('Use at most 80 characters')).toBeTruthy();
    expect(screen.getByText('Enter a quantity above zero, with at most two decimals')).toBeTruthy();
    expect(screen.getByText('Enter a number, such as 12 or 12.5 (at most two decimals)')).toBeTruthy();
    expect(api.createPurchase).not.toHaveBeenCalled();
  });

  it('adds and removes lines', async () => {
    await renderForm();
    await fireEvent.press(await screen.findByText('Add line'));
    expect(screen.getByText('Line 2')).toBeTruthy();
    await fireEvent.press(screen.getByText('Remove line 2'));
    expect(screen.queryByText('Line 2')).toBeNull();
  });

  it('edits a draft from its saved lines; saving replaces them', async () => {
    api.updatePurchase.mockResolvedValue(purchase());
    await renderForm('pur-1');
    expect(await screen.findByDisplayValue('INV-778')).toBeTruthy();
    expect(screen.getByDisplayValue('10')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Quantity'), '12');
    await fireEvent.press(screen.getByText('Save changes'));
    await waitFor(() =>
      expect(api.updatePurchase).toHaveBeenCalledWith('pur-1', {
        supplier_id: 'sup-1',
        reference: 'INV-778',
        notes: null,
        items: [{ product_id: 'prod-urea', location_id: 'loc-shop', quantity: 12, unit_cost: 3100 }],
      }),
    );
    expect(await screen.findByText('Purchase saved')).toBeTruthy();
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('does not offer the form for a purchase already received', async () => {
    api.fetchPurchase.mockResolvedValue(purchase({ status: 'received', received_at: '2026-10-15T10:00:00Z' }));
    await renderForm('pur-1');
    expect(await screen.findByText('This purchase is received')).toBeTruthy();
    expect(screen.queryByText('Save changes')).toBeNull();
  });

  it('shows the 409 when the draft was received elsewhere before the save', async () => {
    api.updatePurchase.mockRejectedValue(apiError(409, 'invalid_transition', 'This purchase is already received'));
    await renderForm('pur-1');
    await fireEvent.press(await screen.findByText('Save changes'));
    expect(await screen.findByText('This purchase is already received')).toBeTruthy();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});

describe('PurchaseDetailScreen', () => {
  it('shows the purchase: supplier, dates, lines and total', async () => {
    await renderDetail();
    expect(await screen.findByText('INV-778')).toBeTruthy();
    expect(await screen.findByText(/^Engro Fertilizers · Bought/)).toBeTruthy();
    expect(screen.getByText('Draft')).toBeTruthy();
    expect(screen.getByText(/^Total Rs/)).toBeTruthy();
    expect(screen.getByText('10 bag')).toBeTruthy();
  });

  it('receives a draft once, after the sheet confirms', async () => {
    api.receivePurchase.mockResolvedValue(purchase({ status: 'received' }));
    await renderDetail();
    await fireEvent.press(await screen.findByText('Receive into stock'));
    expect(screen.getByText('Receive this purchase?')).toBeTruthy();
    await fireEvent.press(lastByText('Receive into stock'));
    await waitFor(() => expect(api.receivePurchase).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Purchase received into stock')).toBeTruthy();
  });

  it('shows a second receive refused (409) in plain words and reloads the purchase', async () => {
    api.receivePurchase.mockRejectedValue(apiError(409, 'invalid_transition', 'This purchase is already received'));
    await renderDetail();
    await fireEvent.press(await screen.findByText('Receive into stock'));
    await fireEvent.press(lastByText('Receive into stock'));
    expect(await screen.findByText('This purchase is already received')).toBeTruthy();
    await waitFor(() => expect(api.fetchPurchase).toHaveBeenCalledTimes(2));
  });

  it('cancels a draft after the sheet confirms', async () => {
    api.cancelPurchase.mockResolvedValue(purchase({ status: 'cancelled' }));
    await renderDetail();
    await fireEvent.press(await screen.findByText('Cancel purchase'));
    expect(screen.getByText('Keep it')).toBeTruthy();
    await fireEvent.press(lastByText('Cancel purchase'));
    await waitFor(() => expect(api.cancelPurchase).toHaveBeenCalledWith('pur-1'));
    expect(await screen.findByText('Purchase cancelled')).toBeTruthy();
  });

  it('opens the edit of a draft', async () => {
    await renderDetail();
    await fireEvent.press(await screen.findByText('Edit purchase'));
    expect(navigation.navigate).toHaveBeenCalledWith(INVENTORY_ROUTES.PurchaseForm, { purchaseId: 'pur-1' });
  });

  it.each([
    ['received', 'Received into stock. A received purchase cannot be edited or received again.'],
    ['cancelled', 'Cancelled. Nothing from it reached your stock.'],
  ] as const)('offers no edit, receive or cancel once %s', async (status, words) => {
    api.fetchPurchase.mockResolvedValue(purchase({ status }));
    await renderDetail();
    expect(await screen.findByText(words)).toBeTruthy();
    expect(screen.queryByText('Edit purchase')).toBeNull();
    expect(screen.queryByText('Receive into stock')).toBeNull();
    expect(screen.queryByText('Cancel purchase')).toBeNull();
  });

  it('shows a failed load with Retry', async () => {
    api.fetchPurchase.mockRejectedValueOnce(apiError(503, 'service_unavailable', 'down'));
    await renderDetail();
    expect(await screen.findByText("Couldn't load this purchase")).toBeTruthy();
  });
});
