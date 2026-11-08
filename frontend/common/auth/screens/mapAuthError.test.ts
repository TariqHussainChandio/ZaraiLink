import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { isEmailNotConfirmed, isSendRateLimited, mapAuthErrorMessage, mapMfaErrorMessage, mapPasswordFlowErrorMessage } from './mapAuthError';

const authError = (code: string) => new AuthApiError('raw sdk text', 400, code);

describe('mapAuthError', () => {
  it('names a lost connection instead of a bare "Failed to sign in" (AU-21)', () => {
    const offline = new AuthRetryableFetchError('Network request failed', 0);
    expect(mapPasswordFlowErrorMessage(offline, 'Could not sign in.')).toBe('No connection. Check your internet, then try again.');
    expect(mapAuthErrorMessage(offline, 'Could not verify.')).toBe('No connection. Check your internet, then try again.');
    expect(mapMfaErrorMessage(new TypeError('Network request failed'), 'x')).toBe('No connection. Check your internet, then try again.');
  });

  it('never shows the SDK text for a code it does not know', () => {
    expect(mapPasswordFlowErrorMessage(authError('something_new'), 'Could not sign in.')).toBe('Could not sign in.');
  });

  it('tells a wrong code from a wrong password', () => {
    expect(mapPasswordFlowErrorMessage(authError('invalid_credentials'), 'x')).toBe('Incorrect email or password.');
    expect(mapAuthErrorMessage(authError('invalid_credentials'), 'x')).toBe('That code is not right. Check it, or ask for a new one.');
  });

  it('recognises the unconfirmed account and a send that was only too soon', () => {
    expect(isEmailNotConfirmed(authError('email_not_confirmed'))).toBe(true);
    expect(isEmailNotConfirmed(authError('invalid_credentials'))).toBe(false);
    expect(isSendRateLimited(authError('over_email_send_rate_limit'))).toBe(true);
    expect(isSendRateLimited(new Error('nope'))).toBe(false);
  });
});
