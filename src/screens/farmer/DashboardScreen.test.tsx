import React from 'react';
import { screen } from '@testing-library/react-native';
import { FarmerDashboardScreen } from './DashboardScreen';
import { renderWithProviders } from '../../testUtils/renderWithProviders';
import { useAuthStore } from '../../store/authStore';
import { fetchOrdersForUser } from '../../services/modules/orders/ordersService';
import { fetchFarms, fetchFarmCrops } from '../../services/modules/farmer/farmService';
import { fetchConsultationsForUser } from '../../services/modules/expert/consultationService';

jest.mock('../../services/supabase/client', () => {
  const { makeSupabaseMock } = jest.requireActual('../../testUtils/supabaseMock');
  return {
    supabase: makeSupabaseMock({
      tables: {
        listings: { data: null, error: null, count: 3 } as never,
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

beforeEach(() => {
  mockFetchOrdersForUser.mockResolvedValue([]);
  mockFetchFarms.mockResolvedValue([]);
  mockFetchFarmCrops.mockResolvedValue([]);
  mockFetchConsultationsForUser.mockResolvedValue([]);
  useAuthStore.setState({ user: { id: 'u1' } as never, role: 'farmer' as never });
});

describe('FarmerDashboardScreen', () => {
  it('renders the shared SellerDashboard with the farmer stats', async () => {
    mockFetchFarms.mockResolvedValue([{ id: 'f1' }, { id: 'f2' }]);
    await renderWithProviders(<FarmerDashboardScreen />);

    expect(await screen.findByText('Active Listings')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('Farms')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('Farms & Crops')).toBeTruthy();
    expect(screen.getByText('Disease Advisory')).toBeTruthy();
  });
});
