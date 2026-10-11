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

/** What a conversation was started from (SRDS §30). Conversations from before A5 have none. */
export type ConversationContextType = 'listing' | 'order' | 'consultation';

export interface ConversationContext {
  type: ConversationContextType;
  id: string;
}

export interface Conversation {
  id: string;
  participant_one: string;
  participant_two: string;
  created_at: string;
  context_type: ConversationContextType | null;
  context_id: string | null;
  participant_one_profile: ConversationParticipant | null;
  participant_two_profile: ConversationParticipant | null;
}

export interface ConversationWithPreview extends Conversation {
  otherParticipant: ConversationParticipant | null;
  lastMessage: Message | null;
}
