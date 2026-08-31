import React from 'react';
import { screen, waitFor } from '@testing-library/react-native';
import { SellerDashboard } from './SellerDashboard';
import { renderWithProviders } from '../../../testUtils/renderWithProviders';
import { useAuthStore } from '../../../store/authStore';
import { fetchOrdersForUser } from '../../../services/modules/orders/ordersService';
import { fetchFarms, fetchFarmCrops } from '../../../services/modules/farmer/farmService';
import { fetchConsultationsForUser } from '../../../services/modules/expert/consultationService';
import { fetchInventory } from '../../../services/modules/dealer/inventoryService';
import { fetchStores } from '../../../services/modules/dealer/storeService';
import { fetchSuppliers } from '../../../services/modules/dealer/supplierService';

jest.mock('../../../services/supabase/client', () => {
  const { makeSupabaseMock } = jest.requireActual('../../../testUtils/supabaseMock');
  return {
    supabase: makeSupabaseMock({
      tables: {
        listings: { data: null, error: null, count: 4 } as never,
        orders: { data: null, error: null, count: 2 } as never,
      },
    }),
  };
});

jest.mock('../../../services/modules/orders/ordersService', () => ({ fetchOrdersForUser: jest.fn() }));
jest.mock('../../../services/modules/farmer/farmService', () => ({
  fetchFarms: jest.fn(),
  fetchFarmCrops: jest.fn(),
}));
jest.mock('../../../services/modules/expert/consultationService', () => ({ fetchConsultationsForUser: jest.fn() }));
jest.mock('../../../services/modules/dealer/inventoryService', () => ({ fetchInventory: jest.fn() }));
jest.mock('../../../services/modules/dealer/storeService', () => ({ fetchStores: jest.fn() }));
jest.mock('../../../services/modules/dealer/supplierService', () => ({ fetchSuppliers: jest.fn() }));

const mockFetchOrdersForUser = fetchOrdersForUser as jest.Mock;
const mockFetchFarms = fetchFarms as jest.Mock;
const mockFetchFarmCrops = fetchFarmCrops as jest.Mock;
const mockFetchConsultationsForUser = fetchConsultationsForUser as jest.Mock;
const mockFetchInventory = fetchInventory as jest.Mock;
const mockFetchStores = fetchStores as jest.Mock;
const mockFetchSuppliers = fetchSuppliers as jest.Mock;

describe('SellerDashboard', () => {
  beforeEach(() => {
    mockFetchOrdersForUser.mockResolvedValue([]);
    mockFetchFarms.mockResolvedValue([]);
    mockFetchFarmCrops.mockResolvedValue([]);
    mockFetchConsultationsForUser.mockResolvedValue([]);
    mockFetchInventory.mockResolvedValue([]);
    mockFetchStores.mockResolvedValue([]);
    mockFetchSuppliers.mockResolvedValue([]);
  });

  it('renders active listings, pending orders, and no extra stats for a buyer', async () => {
    useAuthStore.setState({ user: { id: 'u1' } as never, role: 'buyer' as never });
    await renderWithProviders(<SellerDashboard />);
    expect(await screen.findByText('Active Listings')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('Pending Orders')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.queryByText('Farms')).toBeNull();
    expect(screen.queryByText('Low Stock')).toBeNull();
  });

  it("renders a farmer's farm and consultation stats", async () => {
    useAuthStore.setState({ user: { id: 'u1' } as never, role: 'farmer' as never });
    // 3 farms with no crops keeps farmCount (3) distinct from Active Listings (4) and Pending
    // Orders (2), which come from the module-level supabase table mock and are fixed for every
    // test in this file — a colliding value would make getByText('3') match more than one node.
    mockFetchFarms.mockResolvedValue([{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }]);
    mockFetchFarmCrops.mockResolvedValue([]);
    mockFetchConsultationsForUser.mockResolvedValue([
      { id: 'cs1', status: 'requested' },
      { id: 'cs2', status: 'resolved' },
    ]);
    await renderWithProviders(<SellerDashboard />);
    expect(await screen.findByText('Farms')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('Open Consultations')).toBeTruthy();
    expect(screen.getByText('Resolved')).toBeTruthy();
  });

  it("renders a dealer's low stock, store, and supplier counts", async () => {
    useAuthStore.setState({ user: { id: 'u1' } as never, role: 'dealer' as never });
    // "Stores"/"Suppliers" also appear as Quick Actions button labels, so the stat labels
    // themselves are ambiguous to query — assert via their (mutually distinct) counts instead.
    mockFetchInventory.mockResolvedValue([
      { id: 'i1', stock_quantity: 2, min_stock_threshold: 10 },
      { id: 'i2', stock_quantity: 20, min_stock_threshold: 10 },
      { id: 'i3', stock_quantity: 30, min_stock_threshold: 10 },
    ]);
    mockFetchStores.mockResolvedValue([{ id: 's1' }, { id: 's2' }, { id: 's3' }]);
    mockFetchSuppliers.mockResolvedValue([
      { id: 'sup1' },
      { id: 'sup2' },
      { id: 'sup3' },
      { id: 'sup4' },
      { id: 'sup5' },
    ]);
    await renderWithProviders(<SellerDashboard />);
    expect(await screen.findByText('Low Stock')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('shows recent sales in the activity feed once loaded', async () => {
    useAuthStore.setState({ user: { id: 'u1' } as never, role: 'buyer' as never });
    mockFetchOrdersForUser.mockResolvedValue([
      {
        id: 'o1',
        total: 500,
        status: 'completed',
        buyer: { id: 'b1', full_name: 'Bilal' },
        seller: { id: 'u1', full_name: 'Me' },
      },
    ]);
    await renderWithProviders(<SellerDashboard />);
    expect(await screen.findByText('Bilal')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Rs. 500 · completed')).toBeTruthy());
  });
});
