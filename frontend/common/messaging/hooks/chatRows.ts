import { formatDay } from '../../../utils/dates';
import type { Message, OutgoingMessage } from '../types/messaging';

const DAY_MS = 24 * 60 * 60 * 1000;

/** What a day separator says: "Today", "Yesterday", otherwise "8 Nov" ("8 Nov 2025" for another year). The days are
 * compared the way a person sees them on the wall, in the phone's own zone. */
export function dayLabel(value: string, now: Date = new Date()): string {
  const label = formatDay(value, { now });
  if (label === formatDay(now, { now })) return 'Today';
  if (label === formatDay(new Date(now.getTime() - DAY_MS), { now })) return 'Yesterday';
  return label;
}

export type ChatRow =
  | { kind: 'day'; key: string; label: string }
  | {
      kind: 'message';
      key: string;
      message: Message;
      delivery: 'sent' | 'sending' | 'failed';
      /** Set on a message that is still ours alone: the key to retry it with. */
      localId?: string;
    };

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((value, i) => value === b[i]);

/** True once a message of ours that was not there when the send was first tried has the same words and photos: the send
 * got through even though its reply never came back. */
export function isDelivered(item: OutgoingMessage, messages: Message[], userId: string): boolean {
  if (!item.baseline) return false;
  const before = new Set(item.baseline);
  const uploaded = item.uploaded ?? [];
  return messages.some(
    message => message.sender_id === userId && !before.has(message.id) && message.body === item.body && sameList(message.attachments, uploaded),
  );
}

/** The rows of the chat, oldest first: a day separator wherever the day changes, then each message, then the ones still
 * being sent. A pending photo is drawn from the file on the phone, so its "attachment" is that file's own uri. */
export function buildChatRows(messages: Message[], outgoing: OutgoingMessage[], userId: string | undefined, now: Date = new Date()): ChatRow[] {
  const pending = outgoing
    .filter(item => !userId || !isDelivered(item, messages, userId))
    .map(
      (item): Extract<ChatRow, { kind: 'message' }> => ({
        kind: 'message',
        key: item.localId,
        localId: item.localId,
        delivery: item.status,
        message: {
          id: item.localId,
          conversation_id: '',
          sender_id: userId ?? '',
          body: item.body,
          attachments: item.images.flatMap(image => (image.uri ? [image.uri] : [])),
          read_at: null,
          created_at: item.createdAt,
        },
      }),
    );
  const sent = messages.map((message): Extract<ChatRow, { kind: 'message' }> => ({ kind: 'message', key: message.id, message, delivery: 'sent' }));

  const rows: ChatRow[] = [];
  let lastLabel: string | null = null;
  for (const row of [...sent, ...pending]) {
    const label = dayLabel(row.message.created_at, now);
    if (label !== lastLabel) {
      rows.push({ kind: 'day', key: `day-${rows.length}-${label}`, label });
      lastLabel = label;
    }
    rows.push(row);
  }
  return rows;
}
