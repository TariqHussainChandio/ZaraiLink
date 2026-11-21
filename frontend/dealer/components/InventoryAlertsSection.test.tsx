import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { fetchAlerts } from '../../inventory/services/inventoryService';
import { useAuthStore } from '../../state/authStore';
import { renderWithProviders } from '../../testUtils/renderWithProviders';
import { InventoryAlertsSection } from './InventoryAlertsSection';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
}));
// The inventory API is our own, but this screen only reads the list it returns; the API's rules have their own tests.
jest.mock('../../inventory/services/inventoryService', () => ({ fetchAlerts: jest.fn() }));

const alert = { product_id: 'p1', location_id: null, name: 'Sona Urea', sku: 'SU-50', quantity: 3, unit: 'bags', reorder_threshold: 10, status: 'low_stock' };

function signIn(role: 'dealer' | 'farmer', accountStatus: 'approved' | 'pending' = 'approved') {
  useAuthStore.setState({ role, profile: { id: 'u1', role, account_status: accountStatus, is_suspended: false } as never });
}

beforeEach(() => {
  mockNavigate.mockReset();
  (fetchAlerts as jest.Mock).mockReset().mockResolvedValue([alert]);
});

describe('InventoryAlertsSection (D20: stock alerts in the dealer notifications)', () => {
  it('lists the inventory system stock alerts for an approved dealer, each opening the inventory system', async () => {
    signIn('dealer');
    await renderWithProviders(<InventoryAlertsSection />);
    expect(await screen.findByText('Stock alerts')).toBeTruthy();
    expect(screen.getByText('3 bags left · Inventory system')).toBeTruthy();
    await fireEvent.press(screen.getByText('Sona Urea'));
    expect(mockNavigate).toHaveBeenCalledWith('InventorySystem');
  });

  it.each([
    ['a pending dealer', 'dealer', 'pending'],
    ['a farmer', 'farmer', 'approved'],
  ] as const)('reads no stock alert for %s (BR-03/04)', async (_who, role, status) => {
    signIn(role, status);
    await renderWithProviders(<InventoryAlertsSection />);
    expect(screen.queryByText('Stock alerts')).toBeNull();
    expect(fetchAlerts).not.toHaveBeenCalled();
  });
});
