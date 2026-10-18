import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { AdminOrderDetailScreen } from './AdminOrderDetailScreen';
import { cancelOrderAsAdmin, fetchOrderForAdmin, resolveDisputeAsAdmin, type AdminOrderDetail } from '../services/adminService';
import { ApiError } from '../../services/api/errors';
import { ADMIN_HOME_ROUTES } from '../../common/constants/routes';
import type { AdminScreenProps } from '../../navigation/stacks/AdminNavigator';

jest.mock('../services/adminService', () => ({
  fetchOrderForAdmin: jest.fn(),
  cancelOrderAsAdmin: jest.fn(),
  resolveDisputeAsAdmin: jest.fn(),
}));

const mockFetchOrder = fetchOrderForAdmin as jest.Mock;
const mockCancel = cancelOrderAsAdmin as jest.Mock;
const mockResolve = resolveDisputeAsAdmin as jest.Mock;

type Order = AdminOrderDetail['order'];

const order = (overrides: Partial<Order> = {}): Order => ({
  id: 'order-1',
  buyer_id: 'buyer-1',
  seller_id: 'seller-1',
  status: 'confirmed',
  product_subtotal: 1000,
  delivery_charge: 150,
  total: 1150,
  admin_action_reason: null,
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-01T11:00:00Z',
  buyer: { id: 'buyer-1', full_name: 'Buyer Bilal' },
  seller: { id: 'seller-1', full_name: 'Farmer Sana' },
  order_items: [
    {
      id: 'item-1',
      order_id: 'order-1',
      listing_id: 'listing-1',
      quantity: 10,
      unit_price: 100,
      created_at: '2026-10-01T10:00:00Z',
      listing: { title: 'Wheat', unit: 'kg' },
    },
  ],
  ...overrides,
});

const detail = (overrides: Partial<Order> = {}): AdminOrderDetail => ({
  order: order(overrides),
  history: [
    { id: 'h-1', order_id: 'order-1', from_status: null, to_status: 'pending', changed_by: 'buyer-1', created_at: '2026-10-01T10:00:00Z' },
    { id: 'h-2', order_id: 'order-1', from_status: 'pending', to_status: 'confirmed', changed_by: 'seller-1', created_at: '2026-10-01T11:00:00Z' },
  ],
  payment: null,
});

const props = {
  navigation: { navigate: jest.fn() },
  route: { params: { orderId: 'order-1' } },
} as unknown as AdminScreenProps<typeof ADMIN_HOME_ROUTES.OrderDetail>;

/** The sheet's button renders after the screen's button of the same name, so it is the last match. */
function sheetButton(label: string) {
  const matches = screen.getAllByText(label);
  const last = matches[matches.length - 1];
  if (!last) throw new Error(`No "${label}" button`);
  return last;
}

beforeEach(() => {
  mockFetchOrder.mockReset();
  mockCancel.mockReset();
  mockResolve.mockReset();
});

describe('AdminOrderDetailScreen', () => {
  it('shows the order: parties, items, the delivery charge on its own line, and the status history', async () => {
    mockFetchOrder.mockResolvedValue(detail());
    await renderWithQuery(<AdminOrderDetailScreen {...props} />);

    expect(await screen.findByText('Buyer Bilal')).toBeTruthy();
    expect(mockFetchOrder).toHaveBeenCalledWith('order-1');
    expect(screen.getByText('Farmer Sana')).toBeTruthy();
    expect(screen.getByText('10 kg × Wheat')).toBeTruthy();
    // BR-09: the delivery charge is its own line in the breakdown.
    expect(screen.getByText(/Delivery/)).toBeTruthy();
    expect(screen.getByText('Status history')).toBeTruthy();
  });

  it('cancels an order before dispatch only with a reason, and both parties read it', async () => {
    mockFetchOrder.mockResolvedValueOnce(detail()).mockResolvedValue(detail({ status: 'cancelled', admin_action_reason: 'Fraud report' }));
    mockCancel.mockResolvedValue(order({ status: 'cancelled', admin_action_reason: 'Fraud report' }));
    await renderWithQuery(<AdminOrderDetailScreen {...props} />);
    await screen.findByText('Buyer Bilal');

    await fireEvent.press(screen.getByText('Cancel order'));
    await fireEvent.press(sheetButton('Cancel order'));
    expect(screen.getByText('Say why the order is cancelled')).toBeTruthy();
    expect(mockCancel).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Reason'), '  Fraud report  ');
    await fireEvent.press(sheetButton('Cancel order'));

    expect(mockCancel).toHaveBeenCalledWith('order-1', 'Fraud report');
    expect(await screen.findByText('Order cancelled. The buyer and the seller can read your reason.')).toBeTruthy();
    expect(await screen.findByText("Admin's reason")).toBeTruthy();
    expect(screen.getByText('Fraud report')).toBeTruthy();
    // A cancelled order offers no second cancellation.
    expect(screen.queryByText('Cancel order')).toBeNull();
  });

  it('keeps the order when the admin backs out', async () => {
    mockFetchOrder.mockResolvedValue(detail());
    await renderWithQuery(<AdminOrderDetailScreen {...props} />);
    await screen.findByText('Buyer Bilal');

    await fireEvent.press(screen.getByText('Cancel order'));
    await fireEvent.press(screen.getByText('Keep the order'));

    expect(screen.queryByLabelText('Reason')).toBeNull();
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it.each(['dispatched', 'completed', 'disputed', 'cancelled', 'refunded'] as const)(
    'offers no cancellation once the order is %s (it has left the seller or is settled)',
    async status => {
      mockFetchOrder.mockResolvedValue(detail({ status }));
      await renderWithQuery(<AdminOrderDetailScreen {...props} />);
      await screen.findByText('Buyer Bilal');

      expect(screen.queryByText('Cancel order')).toBeNull();
    },
  );

  it('shows a refusal in the banner, in the words of its error code', async () => {
    mockFetchOrder.mockResolvedValue(detail());
    mockCancel.mockRejectedValue(new ApiError({ status: 403, code: 'mfa_required', kind: 'forbidden', message: 'MFA required' }));
    await renderWithQuery(<AdminOrderDetailScreen {...props} />);
    await screen.findByText('Buyer Bilal');

    await fireEvent.press(screen.getByText('Cancel order'));
    await fireEvent.changeText(screen.getByLabelText('Reason'), 'Fraud report');
    await fireEvent.press(sheetButton('Cancel order'));

    expect(await screen.findByText('This action needs two-step verification.')).toBeTruthy();
  });

  it('shows a retry state when the order cannot be loaded', async () => {
    mockFetchOrder.mockRejectedValueOnce(new Error('offline'));
    await renderWithQuery(<AdminOrderDetailScreen {...props} />);

    expect(await screen.findByText("Couldn't load the order")).toBeTruthy();
    mockFetchOrder.mockResolvedValueOnce(detail());
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('Buyer Bilal')).toBeTruthy();
  });

  it('settles a dispute in favour of the buyer after confirming in a sheet; no money moves through the platform', async () => {
    mockFetchOrder.mockResolvedValueOnce(detail({ status: 'disputed' })).mockResolvedValue(detail({ status: 'refunded' }));
    mockResolve.mockResolvedValue(undefined);
    await renderWithQuery(<AdminOrderDetailScreen {...props} />);
    await screen.findByText('Buyer Bilal');

    await fireEvent.press(screen.getByText('Settle dispute'));
    expect(screen.getByText(/ZaraiLink holds no money/)).toBeTruthy();
    expect(mockResolve).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Reason'), '  Goods arrived spoiled  ');
    await fireEvent.press(sheetButton('Refund the buyer'));

    expect(mockResolve).toHaveBeenCalledWith('order-1', 'refunded', 'Goods arrived spoiled');
    expect(await screen.findByText('Dispute settled: the buyer is to be refunded.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Settle dispute')).toBeNull());
  });

  it('settles a dispute in favour of the seller', async () => {
    mockFetchOrder.mockResolvedValue(detail({ status: 'disputed' }));
    mockResolve.mockResolvedValue(undefined);
    await renderWithQuery(<AdminOrderDetailScreen {...props} />);
    await screen.findByText('Buyer Bilal');

    await fireEvent.press(screen.getByText('Settle dispute'));
    await fireEvent.press(screen.getByText('Complete the order'));
    expect(screen.getByText('The seller is right. The order stands as delivered.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Reason'), 'Delivered as described');
    await fireEvent.press(sheetButton('Complete the order'));

    expect(mockResolve).toHaveBeenCalledWith('order-1', 'completed', 'Delivered as described');
  });

  it('settles nothing without a reason, and says so in the sheet', async () => {
    mockFetchOrder.mockResolvedValue(detail({ status: 'disputed' }));
    await renderWithQuery(<AdminOrderDetailScreen {...props} />);
    await screen.findByText('Buyer Bilal');

    await fireEvent.press(screen.getByText('Settle dispute'));
    await fireEvent.changeText(screen.getByLabelText('Reason'), '   ');
    await fireEvent.press(sheetButton('Refund the buyer'));

    expect(screen.getByText('Say why you settle it this way')).toBeTruthy();
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it('offers no settlement unless the order is disputed, and no cancellation of a disputed one', async () => {
    mockFetchOrder.mockResolvedValue(detail({ status: 'disputed' }));
    await renderWithQuery(<AdminOrderDetailScreen {...props} />);
    await screen.findByText('Buyer Bilal');
    expect(screen.queryByText('Cancel order')).toBeNull();

    await fireEvent.press(screen.getByText('Settle dispute'));
    await fireEvent.press(screen.getByText('Not now'));
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it('shows a refused settlement in the banner', async () => {
    mockFetchOrder.mockResolvedValue(detail({ status: 'disputed' }));
    mockResolve.mockRejectedValue(new ApiError({ status: 403, code: 'mfa_required', kind: 'forbidden', message: 'MFA required' }));
    await renderWithQuery(<AdminOrderDetailScreen {...props} />);
    await screen.findByText('Buyer Bilal');

    await fireEvent.press(screen.getByText('Settle dispute'));
    await fireEvent.changeText(screen.getByLabelText('Reason'), 'Goods arrived spoiled');
    await fireEvent.press(sheetButton('Refund the buyer'));

    expect(await screen.findByText('This action needs two-step verification.')).toBeTruthy();
  });
});
