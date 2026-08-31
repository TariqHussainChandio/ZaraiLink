import React from 'react';
import { screen } from '@testing-library/react-native';
import { DealerDashboardScreen } from './DashboardScreen';
import { renderWithProviders } from '../../testUtils/renderWithProviders';
import { useAuthStore } from '../../store/authStore';
import { fetchOrdersForUser } from '../../services/modules/orders/ordersService';
import { fetchFarms, fetchFarmCrops } from '../../services/modules/farmer/farmService';
import { fetchConsultationsForUser } from '../../services/modules/expert/consultationService';
import { fetchInventory } from '../../services/modules/dealer/inventoryService';
import { fetchStores } from '../../services/modules/dealer/storeService';
import { fetchSuppliers } from '../../services/modules/dealer/supplierService';

// DealerDashboardScreen is a thin wrapper around SellerDashboard (owned by another agent's
// domain), which reads useNavigation() directly and needs a real navigator context.
jest.mock('../../services/supabase/client', () => {
  const { makeSupabaseMock } = jest.requireActual('../../testUtils/supabaseMock');
  return {
    supabase: makeSupabaseMock({
      tables: {
        listings: { data: null, error: null, count: 6 } as never,
        orders: { data: null, error: null, count: 1 } as never,
      },
    }),
  };
});

jest.mock('../../services/modules/orders/ordersService', () => ({ fetchOrdersForUser: jest.fn() }));
jest.mock('../../services/modules/farmer/farmService', () => ({
  fetchFarms: jest.fn(),
  fetchFarmCrops: jest.fn(),
}));
jest.mock('../../services/modules/expert/consultationService', () => ({ fetchConsultationsForUser: jest.fn() }));
jest.mock('../../services/modules/dealer/inventoryService', () => ({ fetchInventory: jest.fn() }));
jest.mock('../../services/modules/dealer/storeService', () => ({ fetchStores: jest.fn() }));
jest.mock('../../services/modules/dealer/supplierService', () => ({ fetchSuppliers: jest.fn() }));

const mockFetchOrdersForUser = fetchOrdersForUser as jest.Mock;
const mockFetchFarms = fetchFarms as jest.Mock;
const mockFetchFarmCrops = fetchFarmCrops as jest.Mock;
const mockFetchConsultationsForUser = fetchConsultationsForUser as jest.Mock;
const mockFetchInventory = fetchInventory as jest.Mock;
const mockFetchStores = fetchStores as jest.Mock;
const mockFetchSuppliers = fetchSuppliers as jest.Mock;

beforeEach(() => {
  useAuthStore.setState({ user: { id: 'dealer-1' } as never, role: 'dealer' as never });
  mockFetchOrdersForUser.mockResolvedValue([]);
  mockFetchFarms.mockResolvedValue([]);
  mockFetchFarmCrops.mockResolvedValue([]);
  mockFetchConsultationsForUser.mockResolvedValue([]);
  mockFetchInventory.mockResolvedValue([{ id: 'i1', stock_quantity: 1, min_stock_threshold: 5 }]);
  mockFetchStores.mockResolvedValue([{ id: 's1' }]);
  mockFetchSuppliers.mockResolvedValue([{ id: 'sup1' }]);
});

describe('DealerDashboardScreen', () => {
  it('renders the dealer variant of the shared seller dashboard', async () => {
    await renderWithProviders(<DealerDashboardScreen />);
    expect(await screen.findByText('Low Stock')).toBeTruthy();
    expect(screen.getByText('Products')).toBeTruthy();
  });
});
