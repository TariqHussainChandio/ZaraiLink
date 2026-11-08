import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { RecordStockSheet, type RecordKind } from './RecordStockSheet';
import { useAuthStore } from '../../state/authStore';
import { adjustStock } from '../services/inventoryService';

jest.mock('../services/inventoryService', () => ({
  adjustStock: jest.fn(),
}));

const mockAdjustStock = adjustStock as jest.Mock;

function renderSheet(onClose = jest.fn(), initialKind?: RecordKind) {
  return renderWithQuery(
    <RecordStockSheet inventoryId="inv1" itemName="DAP 50 kg" unit="bag" currentStock={12} onClose={onClose} initialKind={initialKind} />,
  );
}

describe('RecordStockSheet', () => {
  beforeEach(() => {
    mockAdjustStock.mockReset();
    useAuthStore.setState({ user: { id: 'dealer1' } as never });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows the item, the stock now, and only Stock in, Stock out and Count (never a sale)', async () => {
    await renderSheet();
    expect(screen.getByText('Record stock · DAP 50 kg')).toBeTruthy();
    expect(screen.getByText('12 bags')).toBeTruthy();
    expect(screen.getByText('Stock in')).toBeTruthy();
    expect(screen.getByText('Stock out')).toBeTruthy();
    expect(screen.getByText('Count')).toBeTruthy();
    expect(screen.queryByText(/sale/i)).toBeNull();
  });

  it('shows the result and names it on the button, then records a stock in as an addition with its reason', async () => {
    mockAdjustStock.mockResolvedValue(undefined);
    const onClose = jest.fn();
    await renderSheet(onClose);
    expect(screen.getByRole('button', { name: 'Record stock' }).props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(screen.getByLabelText('Quantity'), '5');
    expect(screen.getByText('After this: 17 bags')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Add 5 bags' }));

    expect(mockAdjustStock).toHaveBeenCalledWith('inv1', 'addition', 5, 'Bought from a supplier');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Added 5 bags. Now 17 bags.')).toBeTruthy();
  });

  it('records a stock out as a reduction with the chosen reason and a note', async () => {
    mockAdjustStock.mockResolvedValue(undefined);
    await renderSheet(jest.fn(), 'out');
    await fireEvent.press(screen.getByRole('button', { name: /Why is stock going out/ }));
    await fireEvent.press(await screen.findByText('Damaged'));
    await fireEvent.changeText(screen.getByLabelText('Quantity'), '2');
    await fireEvent.changeText(screen.getByLabelText('Note'), 'Rain in the godown');
    await fireEvent.press(screen.getByRole('button', { name: 'Remove 2 bags' }));
    expect(mockAdjustStock).toHaveBeenCalledWith('inv1', 'reduction', 2, 'Damaged: Rain in the godown');
  });

  it('blocks a stock out below zero inline, before the server is asked', async () => {
    await renderSheet(jest.fn(), 'out');
    await fireEvent.changeText(screen.getByLabelText('Quantity'), '13');
    expect(screen.getByText('Only 12 bags in stock')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove 13 bags' }).props.accessibilityState.disabled).toBe(true);
    expect(screen.queryByText(/After this/)).toBeNull();
    expect(mockAdjustStock).not.toHaveBeenCalled();
  });

  it('refuses a fraction: whole numbers only', async () => {
    await renderSheet();
    await fireEvent.changeText(screen.getByLabelText('Quantity'), '2.5');
    expect(screen.getByText('Enter a whole number, like 5')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Record stock' }).props.accessibilityState.disabled).toBe(true);
  });

  it('needs a note for a count, then sends the counted figure as an adjustment', async () => {
    mockAdjustStock.mockResolvedValue(undefined);
    await renderSheet(jest.fn(), 'count');
    await fireEvent.changeText(screen.getByLabelText('Counted quantity'), '9');
    expect(screen.getByRole('button', { name: 'Set stock to 9 bags' }).props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(screen.getByLabelText('Note'), 'Shelf count');
    await fireEvent.press(screen.getByRole('button', { name: 'Set stock to 9 bags' }));
    expect(mockAdjustStock).toHaveBeenCalledWith('inv1', 'adjustment', 9, 'Shelf count');
  });

  it('shows a server failure inside the sheet, not as an alert, and keeps what was typed', async () => {
    mockAdjustStock.mockRejectedValue(new Error('Network request failed'));
    const onClose = jest.fn();
    await renderSheet(onClose);
    await fireEvent.changeText(screen.getByLabelText('Quantity'), '5');
    await fireEvent.press(screen.getByRole('button', { name: 'Add 5 bags' }));

    expect(await screen.findByText("Couldn't record this")).toBeTruthy();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Quantity').props.value).toBe('5');
  });
});
