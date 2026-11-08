import spec from '../../backend/openapi.json';
import { ApiError, apiErrorFromNetwork } from '../services/api/errors';
import { ERROR_CODE_MESSAGES, ERROR_KIND_MESSAGES, errorMessage } from './errorMessage';

const apiError = (code: ApiError['code'], kind: ApiError['kind'], fields: ApiError['fields'] = [], status = 422) =>
  new ApiError({ status, code, kind, message: 'English title from the server', fields });

describe('errorMessage', () => {
  it('shows the message for the error code, never the server title', () => {
    expect(errorMessage(apiError('account_suspended', 'forbidden'))).toBe('Your account is suspended.');
    expect(errorMessage(apiError('account_suspended', 'forbidden'))).not.toContain('English title');
  });

  it('names the fields of a validation failure in plain words, never as a field name or a path', () => {
    const error = apiError('validation_failed', 'validation', [{ loc: ['body', 'stock_quantity'], msg: 'x' }]);
    expect(errorMessage(error)).toBe('Check the stock quantity, then try again.');
    expect(errorMessage(error)).not.toMatch(/stock_quantity|\(|\)/);
  });

  it.each([
    [[{ loc: ['body', 'delivery', 'city'], msg: 'x' }], 'Check the city, then try again.'],
    [[{ loc: ['body', 'category_id'], msg: 'x' }], 'Check the category, then try again.'],
    [[{ loc: ['body', 'items', 0, 'quantity'], msg: 'x' }, { loc: ['body', 'price'], msg: 'x' }], 'Check the quantity and price, then try again.'],
    [
      [
        { loc: ['body', 'price'], msg: 'x' },
        { loc: ['body', 'unit_price'], msg: 'x' },
        { loc: ['body', 'full_name'], msg: 'x' },
        { loc: ['body', 'phone'], msg: 'x' },
      ],
      'Check the price, unit price and full name, then try again.',
    ],
  ])('says which fields in a sentence: %j', (fields, expected) => {
    expect(errorMessage(apiError('validation_failed', 'validation', fields))).toBe(expected);
  });

  it('falls back to the general validation line when the server names no field', () => {
    expect(errorMessage(apiError('validation_failed', 'validation', [{ loc: ['body'], msg: 'x' }]))).toBe(ERROR_CODE_MESSAGES.validation_failed);
    expect(errorMessage(apiError('validation_failed', 'validation'))).toBe(ERROR_CODE_MESSAGES.validation_failed);
  });

  it('tells a lost connection from a refusal, a missing item, a clash and a server fault', () => {
    expect(errorMessage(apiErrorFromNetwork(false))).toBe('No connection. Check your internet, then try again.');
    expect(errorMessage(apiErrorFromNetwork(true))).toContain('taking too long');
    expect(errorMessage(apiError('unauthenticated', 'auth', [], 401))).toBe('Sign in again to continue.');
    expect(errorMessage(apiError('forbidden', 'forbidden', [], 403))).toBe('Your account cannot do this.');
    expect(errorMessage(apiError('not_found', 'notFound', [], 404))).toContain('could not be found');
    expect(errorMessage(apiError('conflict', 'conflict', [], 409))).toContain('already exists');
    expect(errorMessage(apiError('server_error', 'server', [], 500))).toContain('server had a problem');
  });

  it('falls back to the kind for a code the app does not know yet (a newer backend)', () => {
    const error = new ApiError({ status: 409, code: 'brand_new_code' as never, kind: 'conflict', message: 'm' });
    expect(errorMessage(error)).toBe(ERROR_KIND_MESSAGES.conflict);
  });

  it('keeps the message of an error that did not come from our API, and never shows [object Object]', () => {
    expect(errorMessage(new Error('Storage upload failed'))).toBe('Storage upload failed');
    expect(errorMessage('a string')).toBe(ERROR_CODE_MESSAGES.unknown);
  });

  it('reads a failed fetch from any client (sign-in goes through supabase-js) as no connection', () => {
    expect(errorMessage(new TypeError('Network request failed'))).toBe(ERROR_CODE_MESSAGES.network);
    expect(errorMessage(new TypeError('Load failed'))).toBe(ERROR_CODE_MESSAGES.network);
    const retryable = new Error('fetch failed');
    retryable.name = 'AuthRetryableFetchError';
    expect(errorMessage(retryable)).toBe(ERROR_CODE_MESSAGES.network);
  });

  it('has a message for every code the backend documents', () => {
    const backendCodes = [...spec.components.schemas.ProblemDetail.properties.code.enum].sort();
    const client = ['network', 'timeout', 'session_expired', 'unknown'];
    expect(Object.keys(ERROR_CODE_MESSAGES).sort()).toEqual([...backendCodes, ...client].sort());
  });

  it('never speaks in the first person or apologises (the interface says what to do, not "we")', () => {
    for (const message of [...Object.values(ERROR_CODE_MESSAGES), ...Object.values(ERROR_KIND_MESSAGES)]) {
      expect(message).not.toMatch(/\b(we|our|sorry)\b/i);
    }
  });
});
