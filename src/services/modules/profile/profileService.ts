import type { PickedPhoto } from '../../../utils/photoPicker';
import { apiFetch } from '../../api/client';
import { supabase } from '../../supabase/client';

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

  const extension = image.fileName?.split('.').pop() ?? 'jpg';
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
}
