import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { NotificationRow } from './NotificationRow';
import { lightColors } from '../../../theme/colors';
import type { Notification } from '../types/notifications';

const NOW = new Date('2026-01-01T10:05:00.000Z');
const flat = (style: unknown) => Object.assign({}, ...(Array.isArray(style) ? style.flat(Infinity) : [style]));

const baseNotification: Notification = {
  id: 'n1',
  user_id: 'u1',
  type: 'order_new',
  payload: {},
  read: false,
  created_at: '2026-01-01T10:00:00.000Z',
};

describe('NotificationRow', () => {
  it('renders the mapped label for a known type and marks it unread in the accessibility label', async () => {
    await render(<NotificationRow notification={baseNotification} onPress={() => {}} now={NOW} />);
    expect(screen.getByText('New order received')).toBeTruthy();
    expect(screen.getByLabelText('New order received, 5 min ago, unread')).toBeTruthy();
  });

  it('does not append ", unread" when the notification has been read', async () => {
    await render(<NotificationRow notification={{ ...baseNotification, read: true }} onPress={() => {}} now={NOW} />);
    expect(screen.getByLabelText('New order received, 5 min ago')).toBeTruthy();
  });

  // A status notification reads "<what changed>: <status word>", the word from the vocabulary (statusMeta), so it stays
  // grammatical for every status and never shows the raw API value.
  it.each([
    ['order_status_changed', 'ready', 'Order status updated: Ready for dispatch'],
    ['order_status_changed', 'payment_failed', 'Order status updated: Payment failed'],
    ['payment_status_changed', 'successful', 'Payment update: Paid'],
    ['payment_status_changed', 'failed', 'Payment update: Payment failed'],
    ['listing_status_changed', 'active', 'Listing status changed: Listed'],
    ['consultation_status_changed', 'accepted', 'Consultation update: Accepted'],
    ['consultation_status_changed', 'rejected', 'Consultation update: Declined'],
    ['expert_verification_changed', 'pending', 'Verification update: Under review'],
    ['account_status_changed', 'approved', 'Application update: Approved'],
    ['account_status_changed', 'rejected', 'Application update: Not approved'],
  ] as const)('describes %s to %s through the vocabulary', async (type, status, text) => {
    const notification: Notification = { ...baseNotification, type, payload: { status } };
    await render(<NotificationRow notification={notification} onPress={() => {}} />);
    expect(screen.getByText(text)).toBeTruthy();
  });

  // FA-20: names the change, never "Stock down to ? (threshold ?)".
  it('says how many are left for inventory_low_stock', async () => {
    const notification: Notification = {
      ...baseNotification,
      type: 'inventory_low_stock',
      payload: { stock_quantity: 3, min_stock_threshold: 10 },
    };
    await render(<NotificationRow notification={notification} onPress={() => {}} />);
    expect(screen.getByText('Low stock: 3 left (alert at 10)')).toBeTruthy();
  });

  it('never prints a question mark when the stock payload is incomplete', async () => {
    const { rerender } = await render(
      <NotificationRow notification={{ ...baseNotification, type: 'inventory_low_stock', payload: { stock_quantity: 5 } }} onPress={() => {}} />,
    );
    expect(screen.getByText('Low stock: 5 left')).toBeTruthy();
    await rerender(<NotificationRow notification={{ ...baseNotification, type: 'inventory_low_stock', payload: {} }} onPress={() => {}} />);
    expect(screen.getByText('Low stock')).toBeTruthy();
    expect(screen.queryByText(/\?/)).toBeNull();
  });

  // FA-20: unread is the amber notification dot and a stronger weight, not the role's accent.
  it('marks an unread row with the notification dot and a stronger weight than a read one', async () => {
    const { rerender } = await render(<NotificationRow notification={baseNotification} onPress={() => {}} />);
    expect(flat(screen.getByTestId('unread-dot').props.style).backgroundColor).toBe(lightColors.module.notifications);
    const unreadWeight = flat(screen.getByText('New order received').props.style).fontWeight;
    await rerender(<NotificationRow notification={{ ...baseNotification, read: true }} onPress={() => {}} />);
    expect(screen.queryByTestId('unread-dot')).toBeNull();
    expect(flat(screen.getByText('New order received').props.style).fontWeight).not.toEqual(unreadWeight);
  });

  it('shows the time relative to now', async () => {
    await render(<NotificationRow notification={baseNotification} onPress={() => {}} now={NOW} />);
    expect(screen.getByText('5 min ago')).toBeTruthy();
  });

  it('describes account suspension vs. reactivation from the payload', async () => {
    const suspended: Notification = {
      ...baseNotification,
      type: 'account_suspension_changed',
      payload: { is_suspended: true },
    };
    await render(<NotificationRow notification={suspended} onPress={() => {}} />);
    expect(screen.getByText('Your account was suspended')).toBeTruthy();
  });

  it.each(['something_new', 'constructor'])('falls back to a generic label for an unknown type (%s)', async type => {
    // 'constructor' is a key every object inherits; it must not be read as a known type.
    const notification: Notification = { ...baseNotification, type, payload: {} };
    await render(<NotificationRow notification={notification} onPress={() => {}} />);
    expect(screen.getByText('Notification')).toBeTruthy();
  });

  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    await render(<NotificationRow notification={baseNotification} onPress={onPress} />);
    await fireEvent.press(screen.getByText('New order received'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
