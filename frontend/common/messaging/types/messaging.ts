import type { PickedPhoto } from '../../../utils/photoPicker';

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  /** Storage paths in the private `message-attachments` bucket, not URLs — resolve with `resolveAttachmentUrls`. */
  attachments: string[];
  read_at: string | null;
  created_at: string;
}

export interface ConversationParticipant {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

export interface Conversation {
  id: string;
  participant_one: string;
  participant_two: string;
  created_at: string;
  participant_one_profile: ConversationParticipant | null;
  participant_two_profile: ConversationParticipant | null;
}

export interface ConversationWithPreview extends Conversation {
  otherParticipant: ConversationParticipant | null;
  lastMessage: Message | null;
}

/**
 * A message the person has sent that the server has not confirmed yet (FA-03). It is drawn at once, "Sending…", and
 * becomes "Not sent · Tap to retry" if the request fails; the draft is therefore never lost.
 */
export interface OutgoingMessage {
  /** Local only; never sent to the server. */
  localId: string;
  body: string;
  images: PickedPhoto[];
  /** The `created_at` it is drawn with, from the phone's clock. */
  createdAt: string;
  status: 'sending' | 'failed';
  /** Storage paths of the photos once uploaded, so a retry does not upload them again. */
  uploaded: string[] | null;
  /** Ids of the messages in the conversation when the POST was first tried. A message of ours that appears afterwards with
   * the same content is this one arriving (the reply was lost, or realtime was faster), and is never sent a second time. */
  baseline: string[] | null;
}
