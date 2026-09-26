import spec from '../../backend/openapi.json';
import { ApiError } from '../services/api/errors';
import { ERROR_CODE_MESSAGES, ERROR_KIND_MESSAGES, errorMessage } from './errorMessage';

const apiError = (code: ApiError['code'], kind: ApiError['kind'], fields: ApiError['fields'] = []) =>
  new ApiError({ status: 422, code, kind, message: 'English title from the server', fields });

describe('errorMessage', () => {
  it('shows the message for the error code, never the server title', () => {
    expect(errorMessage(apiError('account_suspended', 'forbidden'))).toBe('Your account is suspended.');
    expect(errorMessage(apiError('account_suspended', 'forbidden'))).not.toContain('English title');
  });

  it('names the field of a validation failure', () => {
    const error = apiError('validation_failed', 'validation', [{ loc: ['body', 'delivery', 'city'], msg: 'x' }]);
    expect(errorMessage(error)).toBe(`${ERROR_CODE_MESSAGES.validation_failed} (delivery.city)`);
  });

  it('falls back to the kind for a code the app does not know yet (a newer backend)', () => {
    const error = new ApiError({ status: 409, code: 'brand_new_code' as never, kind: 'conflict', message: 'm' });
    expect(errorMessage(error)).toBe(ERROR_KIND_MESSAGES.conflict);
  });

  it('keeps the message of an error that did not come from our API, and never shows [object Object]', () => {
    expect(errorMessage(new Error('Storage upload failed'))).toBe('Storage upload failed');
    expect(errorMessage('a string')).toBe(ERROR_CODE_MESSAGES.unknown);
  });

  it('has a message for every code the backend documents', () => {
    const backendCodes = [...spec.components.schemas.ProblemDetail.properties.code.enum].sort();
    const client = ['network', 'timeout', 'session_expired', 'unknown'];
    expect(Object.keys(ERROR_CODE_MESSAGES).sort()).toEqual([...backendCodes, ...client].sort());
  });
});
