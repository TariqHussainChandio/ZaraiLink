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
