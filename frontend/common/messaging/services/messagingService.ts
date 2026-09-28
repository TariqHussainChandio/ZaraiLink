import type { PickedPhoto } from '../../../utils/photoPicker';
import { extensionFromMimeType } from '../../../utils/mimeExtension';
import { apiFetch } from '../../../services/api/client';
import { supabase } from '../../../services/supabase/client';
import type { Conversation, ConversationWithPreview, Message } from '../types/messaging';

const ATTACHMENTS_BUCKET = 'message-attachments';
const SIGNED_URL_TTL_SECONDS = 3600;

// No userId param — always the caller's own conversations, derived from the session token.
export async function fetchConversations(): Promise<ConversationWithPreview[]> {
  return apiFetch('/api/v1/messaging/conversations');
}

export async function fetchMessages(conversationId: string): Promise<Message[]> {
  return apiFetch(`/api/v1/messaging/conversations/${conversationId}/messages`);
}

// No senderId param — the backend always uses the caller's own id (RLS's own insert policy
// already required this; the backend now never even accepts a client-supplied alternative).
export async function sendMessage(
  conversationId: string,
  body: string,
  attachments: string[] = [],
): Promise<Message> {
  return apiFetch(`/api/v1/messaging/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: { body, attachments },
  });
}

/**
 * `message-attachments` is a private bucket (unlike `avatars`/`listing-images`) — a chat is
 * between two people, so images live at `${conversationId}/${senderId}/...` and RLS scopes
 * both upload and read to that conversation's two participants. Storage-direct, unchanged.
 * Returns storage paths, not URLs; render with `resolveAttachmentUrls`.
 */
export async function uploadMessageAttachments(
  conversationId: string,
  senderId: string,
  images: PickedPhoto[],
): Promise<string[]> {
  const paths: string[] = [];

  for (const image of images) {
    if (!image.uri) continue;

    const extension = extensionFromMimeType(image.mimeType);
    const path = `${conversationId}/${senderId}/${Date.now()}-${Math.round(Math.random() * 1e6)}.${extension}`;

    const response = await fetch(image.uri);
    const arrayBuffer = await response.arrayBuffer();

    const { error } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(path, arrayBuffer, { contentType: image.mimeType ?? 'image/jpeg' });

    if (error) throw error;
    paths.push(path);
  }

  return paths;
}

/** Batch-resolves storage paths to time-limited signed URLs. Storage-direct, unchanged. */
export async function resolveAttachmentUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};

  const { data, error } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error) throw error;

  const urls: Record<string, string> = {};
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) urls[entry.path] = entry.signedUrl;
  }
  return urls;
}

// No userId param — always the caller's own id as one side of the pair; the race-safe
// find-or-create retry now lives in the backend service.
export async function findOrCreateConversation(otherUserId: string): Promise<Conversation> {
  return apiFetch('/api/v1/messaging/conversations', {
    method: 'POST',
    body: { other_user_id: otherUserId },
  });
}

/** Used by `ReportsScreen` to preview a reported message's current body before redacting it. */
export async function fetchMessageById(messageId: string): Promise<Message> {
  return apiFetch(`/api/v1/messaging/messages/${messageId}`);
}

/** Admin-only content moderation. No `actorId` param — derived from the verified session token. */
export async function redactMessage(messageId: string): Promise<void> {
  await apiFetch(`/api/v1/messaging/messages/${messageId}/redact`, { method: 'PATCH' });
}

// No userId param — always the caller's own read receipt.
export async function markConversationRead(conversationId: string): Promise<void> {
  await apiFetch(`/api/v1/messaging/conversations/${conversationId}/read`, { method: 'PATCH' });
}
