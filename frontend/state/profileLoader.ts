import { supabase } from '../services/supabase/client';
import type { Profile } from '../common/types/profile';

/**
 * Why the profile could not be read:
 * - 'offline': no response at all (no connection, host unreachable). Only this case may fall back to the profile
 *   remembered on the device.
 * - 'refused': the server answered 401 or 403, so this session is not accepted. Never answered from the device.
 * - 'failed': any other answer, for example no profile row.
 */
export type ProfileReadFailure = 'offline' | 'refused' | 'failed';

export class ProfileReadError extends Error {
  readonly reason: ProfileReadFailure;

  constructor(reason: ProfileReadFailure, message: string) {
    super(message);
    this.name = 'ProfileReadError';
    this.reason = reason;
  }
}

/** postgrest-js resolves a request that got no response with status 0 (it does not throw). */
function failureFor(status: number | undefined): ProfileReadFailure {
  if (status === 0) return 'offline';
  if (status === 401 || status === 403) return 'refused';
  return 'failed';
}

/**
 * Loads the signed-in user's own profile row (its role and account status decide what the app shows). This is the
 * one read that goes to Supabase directly instead of through the API: it runs while the session is being
 * established, and it must not depend on the API client, which itself signs the user out through the auth store.
 * Row-level security limits it to the caller's own row. Throws a `ProfileReadError` when the row cannot be read; the
 * auth store decides what each reason means.
 */
export async function fetchOwnProfile(userId: string): Promise<Profile> {
  const { data, error, status } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error) throw new ProfileReadError(failureFor(status), error.message);
  return data as Profile;
}
