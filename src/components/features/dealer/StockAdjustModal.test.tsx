import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { StockAdjustModal } from './StockAdjustModal';
import { useAuthStore } from '../../../store/authStore';
import { adjustStock } from '../../../services/modules/dealer/inventoryService';

jest.mock('../../../services/supabase/client', () => {
  const { makeSupabaseMock } = jest.requireActual('../../../testUtils/supabaseMock');
  return { supabase: makeSupabaseMock() };
});

jest.mock('../../../services/modules/dealer/inventoryService', () => ({
  adjustStock: jest.fn(),
}));

const mockAdjustStock = adjustStock as jest.Mock;

describe('StockAdjustModal', () => {
  beforeEach(() => {
    mockAdjustStock.mockReset();
    useAuthStore.setState({ user: { id: 'dealer1' } as never });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the title, quantity field with the unit, and notes field', async () => {
    await render(
      <StockAdjustModal visible inventoryId="inv1" unit="bag" onClose={() => {}} onAdjusted={() => {}} />,
    );
    expect(screen.getByText('Adjust Stock')).toBeTruthy();
    expect(screen.getByText('Quantity (bag)')).toBeTruthy();
    expect(screen.getByText('Notes')).toBeTruthy();
  });

  it('alerts and does not submit when quantity is empty', async () => {
    await render(
      <StockAdjustModal visible inventoryId="inv1" unit="bag" onClose={() => {}} onAdjusted={() => {}} />,
    );
    await fireEvent.press(screen.getByText('Save'));
    expect(Alert.alert).toHaveBeenCalledWith('Enter a valid quantity');
    expect(mockAdjustStock).not.toHaveBeenCalled();
  });

  it('submits the default type and entered quantity, then closes', async () => {
    mockAdjustStock.mockResolvedValue(undefined);
    const onAdjusted = jest.fn();
    const onClose = jest.fn();
    await render(
      <StockAdjustModal visible inventoryId="inv1" unit="bag" onClose={onClose} onAdjusted={onAdjusted} />,
    );
    await fireEvent.changeText(screen.getByTestId('stock-adjust-quantity'), '25');
    await fireEvent.press(screen.getByText('Save'));
    expect(mockAdjustStock).toHaveBeenCalledWith('inv1', 'addition', 25, null);
    expect(onAdjusted).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('lets the user pick a different transaction type before submitting', async () => {
    mockAdjustStock.mockResolvedValue(undefined);
    await render(
      <StockAdjustModal visible inventoryId="inv1" unit="bag" onClose={() => {}} onAdjusted={() => {}} />,
    );
    await fireEvent.press(screen.getByText('Addition (+)'));
    await fireEvent.press(screen.getByText('Reduction (-)'));
    await fireEvent.changeText(screen.getByTestId('stock-adjust-quantity'), '5');
    await fireEvent.press(screen.getByText('Save'));
    expect(mockAdjustStock).toHaveBeenCalledWith('inv1', 'reduction', 5, null);
  });

  it('shows a failure alert when the service call rejects', async () => {
    mockAdjustStock.mockRejectedValue(new Error('Network error'));
    await render(
      <StockAdjustModal visible inventoryId="inv1" unit="bag" onClose={() => {}} onAdjusted={() => {}} />,
    );
    await fireEvent.changeText(screen.getByTestId('stock-adjust-quantity'), '25');
    await fireEvent.press(screen.getByText('Save'));
    expect(Alert.alert).toHaveBeenCalledWith('Failed to adjust stock', 'Network error');
  });
});
