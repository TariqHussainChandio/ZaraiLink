import { ApiError } from '../services/api/errors';
import { logger } from './logger';

describe('logger.warn', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

  afterEach(() => warn.mockClear());
  afterAll(() => warn.mockRestore());

  it('logs an API failure as its code, status and request id, never the response', () => {
    const error = new ApiError({
      status: 403,
      code: 'account_suspended',
      kind: 'forbidden',
      message: 'Account suspended for jane@example.com',
      requestId: 'req-1',
    });
    logger.warn('authStore: failed to load profile', error);
    expect(warn).toHaveBeenCalledWith('[authStore: failed to load profile]', 'account_suspended (status 403, request req-1)');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('jane@example.com');
  });

  it('logs any other error by name and message, and a bare context without noise', () => {
    logger.warn('somewhere', new TypeError('boom'));
    expect(warn).toHaveBeenLastCalledWith('[somewhere]', 'TypeError: boom');
    logger.warn('somewhere');
    expect(warn).toHaveBeenLastCalledWith('[somewhere]', '');
  });
});
