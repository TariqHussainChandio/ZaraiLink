import { apiFetch } from '../../services/api/client';
import {
  createRequiredDocument,
  decideDealerApplication,
  dismissReport,
  fetchAllRequiredDocuments,
  fetchDealerApplication,
  fetchDealerApplications,
  resolveDealerDocumentUrl,
  updateRequiredDocument,
  fetchAllOrders,
  fetchAllProfiles,
  fetchAuditLogs,
  fetchPlatformStats,
  fetchReports,
  resolveReport,
  setProfileSuspended,
  updateUserRole,
  cancelOrderAsAdmin,
  fetchAdminQueues,
  fetchAuditEvents,
  fetchConsultationsForAdmin,
  fetchReviewsForModeration,
  hideReview,
  moderateConsultation,
  resolveDisputeAsAdmin,
  restoreReview,
} from './adminService';

jest.mock('../../services/api/client');

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('fetchPlatformStats', () => {
  it('maps the snake_case API response to camelCase', async () => {
    mockApiFetch.mockResolvedValue({
      total_users: 42,
      users_by_role: { farmer: 20, buyer: 22 },
      total_listings: 10,
      total_orders: 5,
    });

    const result = await fetchPlatformStats();

    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/stats');
    expect(result).toEqual({
      totalUsers: 42,
      usersByRole: { farmer: 20, buyer: 22 },
      totalListings: 10,
      totalOrders: 5,
    });
  });
});

describe('fetchAllProfiles', () => {
  it('fetches the admin users list', async () => {
    mockApiFetch.mockResolvedValue([{ id: 'p1' }]);
    const result = await fetchAllProfiles();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/users', {
      query: { role: undefined, account_status: undefined },
    });
    expect(result).toEqual([{ id: 'p1' }]);
  });

  it('asks the API for the dealers waiting for a decision (filtered on the server, A3a)', async () => {
    mockApiFetch.mockResolvedValue([]);
    await fetchAllProfiles({ role: 'dealer', accountStatus: 'pending' });
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/users', {
      query: { role: 'dealer', account_status: 'pending' },
    });
  });
});

describe('setProfileSuspended', () => {
  it('PATCHes the suspend flag', async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await setProfileSuspended('user-1', true);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/users/user-1/suspend', {
      method: 'PATCH',
      body: { is_suspended: true },
    });
  });
});

describe('updateUserRole', () => {
  it('PATCHes the new role', async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await updateUserRole('user-1', 'dealer');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/users/user-1/role', {
      method: 'PATCH',
      body: { role: 'dealer' },
    });
  });
});

describe('fetchReports', () => {
  it('passes the status filter as a query param', async () => {
    mockApiFetch.mockResolvedValue([]);
    await fetchReports('open');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/reports', { query: { status: 'open' } });
  });

  it('omits the filter when no status is given', async () => {
    mockApiFetch.mockResolvedValue([]);
    await fetchReports();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/reports', { query: { status: undefined } });
  });
});

describe('resolveReport / dismissReport', () => {
  it('PATCHes resolve with notes', async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await resolveReport('report-1', 'handled');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/reports/report-1/resolve', {
      method: 'PATCH',
      body: { notes: 'handled' },
    });
  });

  it('PATCHes dismiss with null notes', async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await dismissReport('report-1', null);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/reports/report-1/dismiss', {
      method: 'PATCH',
      body: { notes: null },
    });
  });
});

describe('fetchAuditLogs', () => {
  it('maps camelCase params to the snake_case query', async () => {
    mockApiFetch.mockResolvedValue([]);
    await fetchAuditLogs({ targetEntity: 'listings', actorId: 'admin-1' });
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/audit-logs', {
      query: { target_entity: 'listings', actor_id: 'admin-1' },
    });
  });

  it('defaults to an empty params object', async () => {
    mockApiFetch.mockResolvedValue([]);
    await fetchAuditLogs();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/audit-logs', {
      query: { target_entity: undefined, actor_id: undefined },
    });
  });
});

describe('fetchAllOrders', () => {
  it('fetches the platform-wide order list', async () => {
    mockApiFetch.mockResolvedValue([]);
    await fetchAllOrders();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/orders');
  });
});

describe('dealer applications (A3b)', () => {
  it('reads the queue by status, one application, and a document link by its id', async () => {
    mockApiFetch.mockResolvedValueOnce([]).mockResolvedValueOnce({}).mockResolvedValueOnce({ url: 'https://signed/doc' });
    await fetchDealerApplications('pending');
    await fetchDealerApplication('dealer-1');
    const url = await resolveDealerDocumentUrl('dealer-1', 'doc-1');
    expect(mockApiFetch).toHaveBeenNthCalledWith(1, '/api/v1/admin/dealer-applications', { query: { status: 'pending' } });
    expect(mockApiFetch).toHaveBeenNthCalledWith(2, '/api/v1/admin/dealer-applications/dealer-1');
    expect(mockApiFetch).toHaveBeenNthCalledWith(3, '/api/v1/admin/dealer-applications/dealer-1/documents/doc-1/url');
    expect(url).toBe('https://signed/doc');
  });

  it('decides with a trimmed reason and returns whether the email went out', async () => {
    mockApiFetch.mockResolvedValue({ new_status: 'rejected', email_delivered: true });
    const result = await decideDealerApplication('dealer-1', 'rejected', '  The licence has expired.  ');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/users/dealer-1/account-status', {
      method: 'PATCH',
      body: { status: 'rejected', reason: 'The licence has expired.' },
    });
    expect(result.email_delivered).toBe(true);
  });
});

describe('required documents (A3b)', () => {
  it('lists, creates and changes entries', async () => {
    mockApiFetch.mockResolvedValue({});
    const input = { role: 'dealer' as const, code: 'tax', label: 'Tax certificate', description: null, is_required: true, sort_order: 40 };
    await fetchAllRequiredDocuments();
    await createRequiredDocument(input);
    await updateRequiredDocument('d1', { active: false });
    expect(mockApiFetch).toHaveBeenNthCalledWith(1, '/api/v1/admin/required-documents');
    expect(mockApiFetch).toHaveBeenNthCalledWith(2, '/api/v1/admin/required-documents', { method: 'POST', body: input });
    expect(mockApiFetch).toHaveBeenNthCalledWith(3, '/api/v1/admin/required-documents/d1', { method: 'PATCH', body: { active: false } });
  });
});

describe('A7 moderation calls (SRDS §14)', () => {
  beforeEach(() => mockApiFetch.mockResolvedValue(undefined as never));

  it('reads the queues and the §51 event names', async () => {
    await fetchAdminQueues();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/queues');
    await fetchAuditEvents();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/audit-events');
  });

  it('filters the audit log by one event name', async () => {
    await fetchAuditLogs({ action: 'review_moderated' });
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/audit-logs', {
      query: { target_entity: undefined, actor_id: undefined, action: 'review_moderated' },
    });
  });

  it('cancels an order with a reason, and settles a dispute through the status route', async () => {
    await cancelOrderAsAdmin('order-1', 'Fraud');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/orders/order-1/cancel', { method: 'POST', body: { reason: 'Fraud' } });
    await resolveDisputeAsAdmin('order-1', 'refunded', 'Goods arrived spoiled');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/orders/order-1/status', {
      method: 'PATCH',
      body: { to: 'refunded', reason: 'Goods arrived spoiled' },
    });
  });

  it('lists and moderates consultations', async () => {
    await fetchConsultationsForAdmin({ status: 'requested', olderThanDays: 7 });
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/consultations', { query: { status: 'requested', older_than_days: 7 } });
    await moderateConsultation('c-1', { action: 'close', reason: 'Duplicate' });
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/consultations/c-1/moderate', {
      method: 'PATCH',
      body: { action: 'close', reason: 'Duplicate' },
    });
  });

  it('lists every review with the hidden ones, hides with a reason and restores; nothing deletes', async () => {
    await fetchReviewsForModeration();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/reviews/admin', { query: { include_hidden: true } });
    await hideReview('review-1', 'Abusive');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/reviews/review-1/hide', { method: 'PATCH', body: { reason: 'Abusive' } });
    await restoreReview('review-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/reviews/review-1/restore', { method: 'PATCH' });
    expect(mockApiFetch.mock.calls.some(([, options]) => (options as { method?: string } | undefined)?.method === 'DELETE')).toBe(false);
  });
});

