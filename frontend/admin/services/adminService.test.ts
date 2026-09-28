import { apiFetch } from '../../services/api/client';
import {
  dismissReport,
  fetchAllOrders,
  fetchAllProfiles,
  fetchAuditLogs,
  fetchPlatformStats,
  fetchReports,
  resolveReport,
  setProfileSuspended,
  updateUserRole,
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
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/admin/users');
    expect(result).toEqual([{ id: 'p1' }]);
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
