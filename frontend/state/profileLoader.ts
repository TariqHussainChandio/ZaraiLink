import { supabase } from '../../supabase/client';
import type { Profile } from '../../../types/profile';

/**
 * Loads the signed-in user's own profile row (its role and account status decide what the app shows). This is the
 * one read that goes to Supabase directly instead of through the API: it runs while the session is being
 * established, and it must not depend on the API client, which itself signs the user out through the auth store.
 * Row-level security limits it to the caller's own row. Throws when the row cannot be read (no row, network down);
 * the auth store decides what a missing profile means.
 */
export async function fetchOwnProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error) throw error;
  return data as Profile;
}
