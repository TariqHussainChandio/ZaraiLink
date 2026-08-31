import { apiFetch } from '../../api/client';
import {
  fetchPaymentByOrderId,
  fetchPaymentById,
  fetchPaymentTransactions,
  initiatePayment,
  markPaymentFailed,
  markPaymentReceived,
} from './paymentsService';

jest.mock('../../api/client');

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('initiatePayment', () => {
  it('sends only orderId and method — never a client-supplied amount', async () => {
    mockApiFetch.mockResolvedValue({});
    await initiatePayment('order-1', 'bank_transfer');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/payments', {
      method: 'POST',
      body: { order_id: 'order-1', method: 'bank_transfer' },
    });
  });
});

describe('reads', () => {
  it('fetchPaymentById fetches a single payment', async () => {
    mockApiFetch.mockResolvedValue({});
    await fetchPaymentById('payment-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/payments/payment-1');
  });

  it('fetchPaymentByOrderId fetches the payment for an order', async () => {
    mockApiFetch.mockResolvedValue(null);
    const result = await fetchPaymentByOrderId('order-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/payments/by-order/order-1');
    expect(result).toBeNull();
  });

  it('fetchPaymentTransactions fetches the transaction log', async () => {
    mockApiFetch.mockResolvedValue([]);
    await fetchPaymentTransactions('payment-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/payments/payment-1/transactions');
  });
});

describe('markPaymentReceived', () => {
  it('PATCHes the received endpoint with no body', async () => {
    mockApiFetch.mockResolvedValue({});
    await markPaymentReceived('payment-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/payments/payment-1/received', { method: 'PATCH' });
  });
});

describe('markPaymentFailed', () => {
  it('PATCHes the failed endpoint with a reason', async () => {
    mockApiFetch.mockResolvedValue({});
    await markPaymentFailed('payment-1', 'card declined');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/payments/payment-1/failed', {
      method: 'PATCH',
      body: { reason: 'card declined' },
    });
  });

  it('accepts a null reason', async () => {
    mockApiFetch.mockResolvedValue({});
    await markPaymentFailed('payment-1', null);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/payments/payment-1/failed', {
      method: 'PATCH',
      body: { reason: null },
    });
  });
});
