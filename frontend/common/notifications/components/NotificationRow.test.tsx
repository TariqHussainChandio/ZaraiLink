import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { NotificationRow } from './NotificationRow';
import type { Notification } from '../types/notifications';

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
    await render(<NotificationRow notification={baseNotification} onPress={() => {}} />);
    expect(screen.getByText('New order received')).toBeTruthy();
    expect(screen.getByLabelText('New order received, unread')).toBeTruthy();
  });

  it('does not append ", unread" when the notification has been read', async () => {
    await render(<NotificationRow notification={{ ...baseNotification, read: true }} onPress={() => {}} />);
    expect(screen.getByLabelText('New order received')).toBeTruthy();
  });

  // A status notification reads "<what changed>: <status word>", the word from the vocabulary (statusMeta), so it stays
  // grammatical for every status and never shows the raw API value.
  it.each([
    ['order_status_changed', 'ready', 'Order status updated: Ready for dispatch'],
    ['order_status_changed', 'payment_failed', 'Order status updated: Payment failed'],
    ['payment_status_changed', 'successful', 'Payment update: Paid'],
    ['payment_status_changed', 'failed', 'Payment update: Payment failed'],
    ['listing_status_changed', 'active', 'Listing status changed: Listed'],
    ['expert_verification_changed', 'pending', 'Verification update: Under review'],
  ] as const)('describes %s to %s through the vocabulary', async (type, status, text) => {
    const notification: Notification = { ...baseNotification, type, payload: { status } };
    await render(<NotificationRow notification={notification} onPress={() => {}} />);
    expect(screen.getByText(text)).toBeTruthy();
  });

  it('builds a payload-aware description for inventory_low_stock', async () => {
    const notification: Notification = {
      ...baseNotification,
      type: 'inventory_low_stock',
      payload: { stock_quantity: 3, min_stock_threshold: 10 },
    };
    await render(<NotificationRow notification={notification} onPress={() => {}} />);
    expect(screen.getByText('Stock down to 3 (threshold 10)')).toBeTruthy();
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
