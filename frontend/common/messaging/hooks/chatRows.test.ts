import { buildChatRows, dayLabel, isDelivered } from './chatRows';
import type { Message, OutgoingMessage } from '../types/messaging';

const NOW = new Date('2026-11-08T12:00:00');
const at = (iso: string) => new Date(iso).toISOString();

const message = (id: string, createdAt: string, overrides: Partial<Message> = {}): Message => ({
  id,
  conversation_id: 'conv-1',
  sender_id: 'seller-1',
  body: `message ${id}`,
  attachments: [],
  read_at: null,
  created_at: at(createdAt),
  ...overrides,
});

const outgoing = (overrides: Partial<OutgoingMessage> = {}): OutgoingMessage => ({
  localId: 'pending-1',
  body: 'On my way',
  images: [],
  createdAt: at('2026-11-08T11:59:00'),
  status: 'sending',
  uploaded: null,
  baseline: null,
  ...overrides,
});

describe('dayLabel', () => {
  it('says Today and Yesterday, then the date', () => {
    expect(dayLabel(at('2026-11-08T09:00:00'), NOW)).toBe('Today');
    expect(dayLabel(at('2026-11-07T23:00:00'), NOW)).toBe('Yesterday');
    expect(dayLabel(at('2026-11-05T09:00:00'), NOW)).toBe('5 Nov');
    expect(dayLabel(at('2025-11-05T09:00:00'), NOW)).toBe('5 Nov 2025');
  });
});

describe('buildChatRows', () => {
  it('puts a day separator wherever the day changes', () => {
    const rows = buildChatRows(
      [message('a', '2026-11-05T09:00:00'), message('b', '2026-11-05T10:00:00'), message('c', '2026-11-08T08:00:00')],
      [],
      'buyer-1',
      NOW,
    );
    expect(rows.map(row => (row.kind === 'day' ? row.label : row.message.id))).toEqual(['5 Nov', 'a', 'b', 'Today', 'c']);
  });

  it('puts the messages still being sent last, with their delivery state and a photo drawn from the phone', () => {
    const rows = buildChatRows(
      [message('a', '2026-11-08T08:00:00')],
      [outgoing({ status: 'failed', images: [{ uri: 'file://leaf.jpg' }] })],
      'buyer-1',
      NOW,
    );
    const last = rows[rows.length - 1];
    expect(last).toMatchObject({ kind: 'message', delivery: 'failed', localId: 'pending-1', message: { attachments: ['file://leaf.jpg'] } });
  });

  it('shows nothing for an empty conversation', () => {
    expect(buildChatRows([], [], 'buyer-1', NOW)).toEqual([]);
  });
});

describe('isDelivered', () => {
  const mine = (id: string, overrides: Partial<Message> = {}) => message(id, '2026-11-08T11:59:30', { sender_id: 'buyer-1', body: 'On my way', ...overrides });

  it('is false until the send was tried', () => {
    expect(isDelivered(outgoing(), [mine('new')], 'buyer-1')).toBe(false);
  });

  it('recognises our own new message with the same words as this one arriving', () => {
    const item = outgoing({ baseline: ['old'], uploaded: [] });
    expect(isDelivered(item, [mine('old'), mine('new')], 'buyer-1')).toBe(true);
  });

  it('does not count a message that was already there, someone else\'s, or different words or photos', () => {
    const item = outgoing({ baseline: ['old'], uploaded: [] });
    expect(isDelivered(item, [mine('old')], 'buyer-1')).toBe(false);
    expect(isDelivered(item, [mine('new', { sender_id: 'seller-1' })], 'buyer-1')).toBe(false);
    expect(isDelivered(item, [mine('new', { body: 'Something else' })], 'buyer-1')).toBe(false);
    expect(isDelivered(item, [mine('new', { attachments: ['p.jpg'] })], 'buyer-1')).toBe(false);
  });

  it('hides a pending bubble once its message has arrived by another route', () => {
    const item = outgoing({ baseline: ['old'], uploaded: [] });
    const rows = buildChatRows([mine('old'), mine('new')], [item], 'buyer-1', NOW);
    expect(rows.filter(row => row.kind === 'message')).toHaveLength(2);
  });
});
