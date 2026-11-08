import { apiFetch, apiFetchPage } from '../../services/api/client';
import {
  createRequiredDocument,
  decideDealerApplication,
  dismissReport,
  fetchAllRequiredDocuments,
  fetchDealerApplication,
  fetchDealerApplications,
  resolveDealerDocumentUrl,
  updateRequiredDocument,
  ADMIN_PAGE_SIZE,
  fetchAuditLogsPage,
  fetchModerationListingsPage,
  fetchOrdersPage,
  fetchProfilesPage,
  fetchPlatformStats,
  fetchReportsPage,
  resolveReport,
  setProfileSuspended,
  updateUserRole,
} from './adminService';

jest.mock('../../services/api/client');

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
const mockApiFetchPage = apiFetchPage as jest.MockedFunction<typeof apiFetchPage>;
const nextPage = { data: [], next: { limit: 50, offset: 50 } };

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

describe('fetchProfilesPage', () => {
  it('asks for one page of users at the offset', async () => {
    mockApiFetchPage.mockResolvedValue(nextPage);
    const page = await fetchProfilesPage({}, 0);
    expect(mockApiFetchPage).toHaveBeenCalledWith('/api/v1/admin/users', {
      query: { role: undefined, account_status: undefined, limit: ADMIN_PAGE_SIZE, offset: 0 },
    });
    expect(page.next).toEqual({ limit: 50, offset: 50 });
  });

  it('filters on the server by role and account status (A3a), and continues from the offset', async () => {
    mockApiFetchPage.mockResolvedValue({ data: [], next: null });
    await fetchProfilesPage({ role: 'dealer', accountStatus: 'pending' }, 100);
    expect(mockApiFetchPage).toHaveBeenCalledWith('/api/v1/admin/users', {
      query: { role: 'dealer', account_status: 'pending', limit: ADMIN_PAGE_SIZE, offset: 100 },
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

describe('fetchReportsPage', () => {
  it('passes the status filter and the page as query params', async () => {
    mockApiFetchPage.mockResolvedValue({ data: [], next: null });
    await fetchReportsPage('open', 50);
    expect(mockApiFetchPage).toHaveBeenCalledWith('/api/v1/admin/reports', {
      query: { status: 'open', limit: ADMIN_PAGE_SIZE, offset: 50 },
    });
  });

  it('omits the filter when no status is given', async () => {
    mockApiFetchPage.mockResolvedValue({ data: [], next: null });
    await fetchReportsPage(undefined, 0);
    expect(mockApiFetchPage).toHaveBeenCalledWith('/api/v1/admin/reports', {
      query: { status: undefined, limit: ADMIN_PAGE_SIZE, offset: 0 },
    });
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

describe('fetchAuditLogsPage', () => {
  it('maps camelCase params to the snake_case query, with the page', async () => {
    mockApiFetchPage.mockResolvedValue({ data: [], next: null });
    await fetchAuditLogsPage({ targetEntity: 'listings', actorId: 'admin-1' }, 50);
    expect(mockApiFetchPage).toHaveBeenCalledWith('/api/v1/admin/audit-logs', {
      query: { target_entity: 'listings', actor_id: 'admin-1', limit: ADMIN_PAGE_SIZE, offset: 50 },
    });
  });

  it('reads every area when no entity is given', async () => {
    mockApiFetchPage.mockResolvedValue({ data: [], next: null });
    await fetchAuditLogsPage({}, 0);
    expect(mockApiFetchPage).toHaveBeenCalledWith('/api/v1/admin/audit-logs', {
      query: { target_entity: undefined, actor_id: undefined, limit: ADMIN_PAGE_SIZE, offset: 0 },
    });
  });
});

describe('fetchOrdersPage', () => {
  it('pages the platform order list', async () => {
    mockApiFetchPage.mockResolvedValue({ data: [], next: null });
    await fetchOrdersPage(50);
    expect(mockApiFetchPage).toHaveBeenCalledWith('/api/v1/admin/orders', { query: { limit: ADMIN_PAGE_SIZE, offset: 50 } });
  });
});

describe('fetchModerationListingsPage', () => {
  it('pages the moderation list, which has no filter of its own', async () => {
    mockApiFetchPage.mockResolvedValue({ data: [], next: null });
    await fetchModerationListingsPage(0);
    expect(mockApiFetchPage).toHaveBeenCalledWith('/api/v1/marketplace/listings/moderation', {
      query: { limit: ADMIN_PAGE_SIZE, offset: 0 },
    });
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
