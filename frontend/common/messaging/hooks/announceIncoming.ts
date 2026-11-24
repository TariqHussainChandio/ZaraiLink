// Reads new incoming chat messages aloud for screen reader users.
import { useEffect, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';

/** The fields of a chat or consultation message that an announcement needs. */
export interface AnnounceableMessage {
  id: string;
  sender_id: string;
  body: string;
  attachments: string[];
}

/** What a message says, read aloud: its text, or how many photos it carries when it has no text. */
function spokenContent(message: AnnounceableMessage): string {
  if (message.body) return message.body;
  const count = message.attachments.length;
  return count === 1 ? 'a photo' : `${count} photos`;
}

/** The sentence for messages that just arrived from the other person; the latest is read in full. */
export function incomingAnnouncement(incoming: AnnounceableMessage[], senderName: string): string {
  const latest = incoming[incoming.length - 1];
  if (!latest) return '';
  if (incoming.length === 1) return `New message from ${senderName}: ${spokenContent(latest)}`;
  return `${incoming.length} new messages from ${senderName}. Latest: ${spokenContent(latest)}`;
}

/**
 * Tells a screen-reader user when the other person's message arrives in an open chat or consultation thread (A8, WCAG
 * 4.1.3 Status Messages): the list is a FlashList, which has no live region, so a new bubble at the bottom was silent.
 *
 * Announced once per arrival. The history that is there when the thread first loads is not announced, and neither are
 * the user's own sends: the user knows what they sent, and reading back a whole conversation on open would drown the
 * screen. `messages` is undefined until the first load; ids seen before are never announced again, so a refetch on
 * focus or a realtime echo of a row already shown stays quiet.
 */
export function useAnnounceIncomingMessages(
  messages: AnnounceableMessage[] | undefined,
  userId: string | undefined,
  senderName: string,
) {
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (messages === undefined) return;
    if (seen.current === null) {
      seen.current = new Set(messages.map(message => message.id));
      return;
    }
    const known = seen.current;
    const arrived = messages.filter(message => !known.has(message.id));
    arrived.forEach(message => known.add(message.id));
    const fromOther = arrived.filter(message => message.sender_id !== userId);
    if (fromOther.length > 0) {
      AccessibilityInfo.announceForAccessibility(incomingAnnouncement(fromOther, senderName));
    }
  }, [messages, userId, senderName]);
}
