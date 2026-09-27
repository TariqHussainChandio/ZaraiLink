import { apiFetch } from '../../api/client';
import { fetchNotifications, fetchUnreadCount, markAllRead, markRead } from './notificationsService';

jest.mock('../../api/client');

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('fetchNotifications', () => {
  it('fetches the caller-scoped notification list', async () => {
    mockApiFetch.mockResolvedValue([{ id: 'n1' }]);
    const result = await fetchNotifications();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/notifications');
    expect(result).toEqual([{ id: 'n1' }]);
  });
});

describe('fetchUnreadCount', () => {
  it('unwraps the count field from the response', async () => {
    mockApiFetch.mockResolvedValue({ count: 4 });
    const result = await fetchUnreadCount();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/notifications/unread-count');
    expect(result).toBe(4);
  });
});

describe('markRead', () => {
  it('PATCHes the given notification as read', async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await markRead('notif-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/notifications/notif-1/read', { method: 'PATCH' });
  });
});

describe('markAllRead', () => {
  it('PATCHes the mark-all-read endpoint', async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await markAllRead();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/notifications/read-all', { method: 'PATCH' });
  });
});
