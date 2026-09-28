import type { PickedPhoto } from '../../../utils/photoPicker';
import { extensionFromMimeType } from '../../../utils/mimeExtension';
import { apiFetch } from '../../../services/api/client';
import { supabase } from '../../../services/supabase/client';
import { logger } from '../../../utils/logger';

export interface ProfileUpdateInput {
  full_name?: string;
  phone?: string | null;
  location?: string | null;
  avatar_url?: string | null;
  country?: string | null;
  province?: string | null;
  city?: string | null;
  village?: string | null;
  street?: string | null;
  notifications_enabled?: boolean;
}

// No userId param — always the caller's own profile, derived from the verified session token.
export async function updateProfile(input: ProfileUpdateInput): Promise<void> {
  await apiFetch('/api/v1/profile', { method: 'PATCH', body: input });
}

// Storage-direct, unchanged — owner-scoped RLS on the `avatars` bucket already correctly
// restricts this; only the resulting `profiles.avatar_url` write goes through FastAPI, via
// `updateProfile` above, called separately by the screen after a successful upload.
export async function uploadAvatar(userId: string, image: PickedPhoto): Promise<string> {
  if (!image.uri) throw new Error('No image selected');

  const extension = extensionFromMimeType(image.mimeType);
  const path = `${userId}/avatar-${Date.now()}.${extension}`;

  const response = await fetch(image.uri);
  const arrayBuffer = await response.arrayBuffer();

  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, arrayBuffer, { contentType: image.mimeType ?? 'image/jpeg' });

  if (error) throw error;

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}

// Supabase Auth SDK directly — unchanged, per the auth strategy (Auth stays on the client).
export async function updatePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
  // P4 (4B.4): a changed password should invalidate any other device/session that's still
  // signed in with the old one — `scope: 'others'` leaves this session (the one that just set
  // the new password) alone. The password change itself already succeeded at this point, so a
  // failure revoking other sessions isn't surfaced as this call's own error.
  // Logged, not thrown: the user changed their password successfully, but should be able to see in the logs that the
  // other devices may still be signed in.
  const { error: revokeError } = await supabase.auth.signOut({ scope: 'others' });
  if (revokeError) logger.warn('profileService: could not sign out other sessions', revokeError);
}

// P4 (4A.5). Backend order: re-authenticate -> anonymize the profile in place -> delete owned
// storage objects -> audit-log -> soft-delete the auth user (blocks future sign-in without
// cascading). The caller (DeleteAccountScreen) signs out locally right after this resolves —
// the current session's own access token may still verify for the few seconds until it expires,
// but the account behind it can no longer be used to sign in again.
export async function deleteOwnAccount(password: string): Promise<void> {
  await apiFetch('/api/v1/profile/me', { method: 'DELETE', body: { password } });
}
