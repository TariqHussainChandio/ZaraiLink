import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Profile } from '../common/types/profile';
import { logger } from '../utils/logger';

/**
 * The part of the last profile the server returned that decides which shell the app opens: the role, the application
 * status and the suspension. It lets a signed-in user who starts the app offline land in their own shell (a dealer
 * reaches the inventory system kept on the device) instead of a shell picked by default (B4 verification, F1).
 *
 * Only these fields are written: names, phone numbers and addresses stay in memory, like every other personal read
 * (`frontend/hooks/queryClient.ts`). The record carries the user id it belongs to and is read back only for that same
 * user; it is forgotten with the persisted query cache on sign-out and on an account switch.
 */
export type RememberedProfile = Pick<Profile, 'id' | 'role' | 'account_status' | 'is_suspended'>;

const REMEMBERED_PROFILE_KEY = 'zl-remembered-profile';

function isRemembered(value: unknown): value is RememberedProfile {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.role === 'string' &&
    typeof record.account_status === 'string' &&
    typeof record.is_suspended === 'boolean'
  );
}

/** Records the profile the server just returned, replacing whatever was remembered (a suspension replaces at once). */
export async function rememberProfile(profile: Profile): Promise<void> {
  const record: RememberedProfile = {
    id: profile.id,
    role: profile.role,
    account_status: profile.account_status,
    is_suspended: profile.is_suspended,
  };
  await AsyncStorage.setItem(REMEMBERED_PROFILE_KEY, JSON.stringify(record));
}

/** The remembered profile of this user, or null when there is none or it belongs to someone else. */
export async function recallProfile(userId: string): Promise<RememberedProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(REMEMBERED_PROFILE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isRemembered(parsed) && parsed.id === userId ? parsed : null;
  } catch (err) {
    logger.warn('rememberedProfile: could not read the remembered profile', err);
    return null;
  }
}

/**
 * Forgets the remembered profile. `keepUserId` spares the record of the account that is starting now: on an account
 * switch the new user's profile may already have been written by the time the wipe runs.
 */
export async function forgetRememberedProfile(keepUserId?: string): Promise<void> {
  if (keepUserId !== undefined) {
    const kept = await recallProfile(keepUserId);
    if (kept !== null) return;
  }
  await AsyncStorage.removeItem(REMEMBERED_PROFILE_KEY);
}
