import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { NotificationListScreen } from './NotificationListScreen';
import { fetchNotifications, markAllRead, markRead } from '../../services/modules/notifications/notificationsService';
import { useAuthStore } from '../../store/authStore';
import { APP_TABS, MESSAGING_ROUTES, ORDERS_ROUTES } from '../../constants/routes';
import type { Notification } from '../../types/notifications';

const mockGetParentNavigate = jest.fn();

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const { useEffect } = jest.requireActual('react');
  return {
    ...actual,
    useFocusEffect: (effect: () => void) =>
      useEffect(() => {
        effect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []),
    useNavigation: () => ({
      getParent: () => ({ navigate: mockGetParentNavigate }),
      navigate: mockGetParentNavigate,
    }),
  };
});

jest.mock('../../services/modules/notifications/notificationsService', () => ({
  fetchNotifications: jest.fn(),
  markRead: jest.fn(),
  markAllRead: jest.fn(),
}));

const mockFetchNotifications = fetchNotifications as jest.Mock;
const mockMarkRead = markRead as jest.Mock;
const mockMarkAllRead = markAllRead as jest.Mock;

const notification = (overrides: Partial<Notification> = {}): Notification => ({
  id: 'notif-1',
  user_id: 'user-1',
  type: 'order_status_changed',
  payload: { order_id: 'order-1', status: 'confirmed' },
  read: false,
  created_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

beforeEach(() => {
  mockFetchNotifications.mockReset();
  mockMarkRead.mockReset().mockResolvedValue(undefined);
  mockMarkAllRead.mockReset().mockResolvedValue(undefined);
  mockGetParentNavigate.mockReset();
  useAuthStore.setState({ user: { id: 'user-1' } as never });
});

describe('NotificationListScreen', () => {
  it('loads and renders notifications', async () => {
    mockFetchNotifications.mockResolvedValue([notification()]);
    await renderWithQuery(<NotificationListScreen />);
    expect(await screen.findByText('Order is now confirmed')).toBeTruthy();
  });

  it('shows an empty state when there are no notifications', async () => {
    mockFetchNotifications.mockResolvedValue([]);
    await renderWithQuery(<NotificationListScreen />);
    expect(await screen.findByText('No notifications yet')).toBeTruthy();
  });

  it('shows a retry state when loading fails', async () => {
    mockFetchNotifications.mockRejectedValue(new Error('Network error'));
    await renderWithQuery(<NotificationListScreen />);
    expect(await screen.findByText("Couldn't load notifications")).toBeTruthy();

    mockFetchNotifications.mockResolvedValue([notification()]);
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('Order is now confirmed')).toBeTruthy();
  });

  it('marks a notification read and navigates to the related order', async () => {
    mockFetchNotifications.mockResolvedValue([notification()]);
    await renderWithQuery(<NotificationListScreen />);
    await fireEvent.press(await screen.findByText('Order is now confirmed'));

    expect(mockMarkRead).toHaveBeenCalledWith('notif-1');
    expect(mockGetParentNavigate).toHaveBeenCalledWith(APP_TABS.Orders, {
      screen: ORDERS_ROUTES.OrderDetail,
      params: { orderId: 'order-1' },
    });
  });

  it('navigates to the related conversation for a message notification without marking it read again', async () => {
    mockFetchNotifications.mockResolvedValue([
      notification({
        id: 'notif-2',
        type: 'new_message',
        read: true,
        payload: { conversation_id: 'conversation-1', sender_name: 'Ali Khan' },
      }),
    ]);
    await renderWithQuery(<NotificationListScreen />);
    await fireEvent.press(await screen.findByText('New message from Ali Khan'));

    expect(mockMarkRead).not.toHaveBeenCalled();
    expect(mockGetParentNavigate).toHaveBeenCalledWith(APP_TABS.Messages, {
      screen: MESSAGING_ROUTES.Chat,
      params: { conversationId: 'conversation-1', otherUserName: 'Ali Khan' },
    });
  });

  it('shows Mark all as read only when there are unread notifications, and calls markAllRead', async () => {
    mockFetchNotifications.mockResolvedValue([notification({ read: false })]);
    await renderWithQuery(<NotificationListScreen />);
    await screen.findByText('Order is now confirmed');

    expect(screen.getByText('Mark all as read')).toBeTruthy();
    await fireEvent.press(screen.getByText('Mark all as read'));
    expect(mockMarkAllRead).toHaveBeenCalledTimes(1);
  });

  it('hides Mark all as read when everything is already read', async () => {
    mockFetchNotifications.mockResolvedValue([notification({ read: true })]);
    await renderWithQuery(<NotificationListScreen />);
    await screen.findByText('Order is now confirmed');

    expect(screen.queryByText('Mark all as read')).toBeNull();
  });
});
