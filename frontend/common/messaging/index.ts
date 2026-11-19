// Public entry point of frontend/common/messaging (A1, docs/plan.md §1 rule 4): other modules import only what is
// listed here: what the other modules use, nothing more.
export { ChatInput } from './components/ChatInput';
export { useAnnounceIncomingMessages } from './hooks/announceIncoming';
export { isUnread, useConversations, useOpenConversation } from './hooks/messaging';
export { fetchMessageById, redactMessage } from './services/messagingService';
export type { Message } from './types/messaging';
