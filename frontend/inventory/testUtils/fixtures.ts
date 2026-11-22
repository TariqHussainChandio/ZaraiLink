import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { act } from '@testing-library/react-native';
import { ApiError, type FieldError } from '../../services/api/errors';
import { useAuthStore } from '../../state/authStore';
import type {
  AlertSettings,
  Dashboard,
  InventoryLocation,
  InventorySupplier,
  Movement,
  ProductView,
  Purchase,
  StockAlert,
  StockLevel,
  SyncLogEntry,
} from '../types/inventory';
import type { InventoryStackParamList } from '../types/navigation';

// Rows shaped exactly as the inventory API returns them (backend/app/inventory/schemas.py), for the module's screen
// and hook tests. Only the outer edge is faked: each test mocks services/inventoryService and feeds these through it.

const DEALER_ID = 'dealer-a';
const AT = '2026-10-15T09:30:00Z';

export function location(overrides: Partial<InventoryLocation> = {}): InventoryLocation {
  return {
    id: 'loc-shop',
    dealer_id: DEALER_ID,
    name: 'Main shop',
    kind: 'shop',
    address: null,
    is_default: true,
    is_active: true,
    created_at: AT,
    updated_at: AT,
    ...overrides,
  };
}

export const godown = (overrides: Partial<InventoryLocation> = {}) =>
  location({ id: 'loc-godown', name: 'Back godown', kind: 'godown', is_default: false, ...overrides });

export function product(overrides: Partial<ProductView> = {}): ProductView {
  return {
    id: 'prod-urea',
    dealer_id: DEALER_ID,
    sku: 'UREA-50',
    name: 'Urea 50kg',
    unit: 'bag',
    cost_price: 3200,
    selling_price: 3600,
    reorder_threshold: 5,
    is_active: true,
    total_quantity: 20,
    default_location_quantity: 20,
    stock: [{ location_id: 'loc-shop', quantity: 20 }],
    listings: [],
    created_at: AT,
    updated_at: AT,
    ...overrides,
  };
}

export function movement(overrides: Partial<Movement> = {}): Movement {
  return {
    id: 'mov-1',
    dealer_id: DEALER_ID,
    product_id: 'prod-urea',
    location_id: 'loc-shop',
    direction: 'in',
    source: 'RESTOCK',
    quantity: 10,
    quantity_before: 10,
    quantity_after: 20,
    reason: null,
    actor: DEALER_ID,
    order_id: null,
    order_item_id: null,
    purchase_id: null,
    transfer_id: null,
    created_at: AT,
    ...overrides,
  };
}

export function stockLevel(overrides: Partial<StockLevel> = {}): StockLevel {
  return { dealer_id: DEALER_ID, product_id: 'prod-urea', location_id: 'loc-shop', quantity: 20, updated_at: AT, ...overrides };
}

export function alert(overrides: Partial<StockAlert> = {}): StockAlert {
  return {
    product_id: 'prod-dap',
    sku: 'DAP-50',
    name: 'DAP 50kg',
    unit: 'bag',
    location_id: null,
    quantity: 2,
    reorder_threshold: 5,
    status: 'low_stock',
    ...overrides,
  };
}

export function supplier(overrides: Partial<InventorySupplier> = {}): InventorySupplier {
  return {
    id: 'sup-1',
    dealer_id: DEALER_ID,
    name: 'Engro Fertilizers',
    contact: '0300 1234567',
    products_supplied: 'Urea, DAP',
    notes: null,
    is_active: true,
    created_at: AT,
    updated_at: AT,
    ...overrides,
  };
}

export function purchase(overrides: Partial<Purchase> = {}): Purchase {
  return {
    id: 'pur-1',
    dealer_id: DEALER_ID,
    supplier_id: 'sup-1',
    reference: 'INV-778',
    status: 'draft',
    purchased_on: '2026-10-14',
    received_at: null,
    notes: null,
    items: [
      {
        id: 'pi-1',
        dealer_id: DEALER_ID,
        purchase_id: 'pur-1',
        product_id: 'prod-urea',
        location_id: 'loc-shop',
        quantity: 10,
        unit_cost: 3100,
        created_at: AT,
      },
    ],
    created_at: AT,
    updated_at: AT,
    ...overrides,
  };
}

export function alertSettings(overrides: Partial<AlertSettings> = {}): AlertSettings {
  return {
    dealer_id: DEALER_ID,
    default_reorder_threshold: 5,
    notify_low_stock: true,
    notify_sync_failure: true,
    updated_at: AT,
    ...overrides,
  };
}

export function syncEntry(overrides: Partial<SyncLogEntry> = {}): SyncLogEntry {
  return {
    id: 'sync-1',
    dealer_id: DEALER_ID,
    order_event_id: 'evt-1',
    order_id: '3f2a9c1b-1111-4222-8333-444455556666',
    order_item_id: 'item-1',
    listing_id: 'listing-urea',
    status: 'applied',
    attempts: 1,
    error: null,
    processed_at: AT,
    ...overrides,
  };
}

export function dashboard(overrides: Partial<Dashboard> = {}): Dashboard {
  return {
    totals: { products: 3, stock_units: 42.5, low_stock: 1, out_of_stock: 2, inventory_value: 125000 },
    trend: [
      { date: '2026-10-14', in: 10, out: 4 },
      { date: '2026-10-15', in: 0, out: 3 },
    ],
    alerts: [alert()],
    recent_movements: [movement()],
    recent_adjustments: [],
    recent_restocks: [],
    recent_purchases: [],
    sync_failures: 0,
    ...overrides,
  };
}

/** An API refusal as apiErrorFromResponse builds it from the backend's problem detail. */
export function apiError(
  status: number,
  code: ApiError['code'],
  message: string,
  fields: FieldError[] = [],
): ApiError {
  const kind = status === 409 ? 'conflict' : status === 422 ? 'validation' : status === 0 ? 'network' : 'unknown';
  return new ApiError({ status, code, kind, message, fields });
}

/** Screen props with a recording navigation; the screens are rendered inside renderWithProviders' real navigator. */
export function screenProps<R extends keyof InventoryStackParamList>(
  params: InventoryStackParamList[R],
  navigation: Record<string, unknown>,
): NativeStackScreenProps<InventoryStackParamList, R> {
  return { navigation, route: { key: 'test', name: 'test', params } } as unknown as NativeStackScreenProps<
    InventoryStackParamList,
    R
  >;
}

/** The signed-in approved dealer every IMS screen is for (BR-03/04). Awaited: RNTL 14's act is asynchronous, and an
 * act left running overlaps the next render. */
export async function signInApprovedDealer(id = DEALER_ID): Promise<void> {
  await act(async () => {
    useAuthStore.setState({
      session: null,
      user: { id } as never,
      role: 'dealer',
      status: 'authenticated',
      profile: { id, role: 'dealer', full_name: 'Ali Traders', account_status: 'approved', is_suspended: false } as never,
    });
  });
}
