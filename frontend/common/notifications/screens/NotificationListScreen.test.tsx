import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { NotificationListScreen } from './NotificationListScreen';
import { fetchNotifications, markAllRead, markRead } from '../services/notificationsService';
import { useAuthStore } from '../../../state/authStore';
import { APP_TABS, CONSULTATIONS_ROUTES, MESSAGING_ROUTES, ORDERS_ROUTES } from '../../constants/routes';
import type { Notification } from '../types/notifications';

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

jest.mock('../services/notificationsService', () => ({
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
  created_at: new Date().toISOString(),
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
    expect(await screen.findByText('Order status updated: Confirmed')).toBeTruthy();
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
    expect(screen.queryByText('No notifications yet')).toBeNull();

    mockFetchNotifications.mockResolvedValue([notification()]);
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('Order status updated: Confirmed')).toBeTruthy();
  });

  it('marks a notification read and navigates to the related order', async () => {
    mockFetchNotifications.mockResolvedValue([notification()]);
    await renderWithQuery(<NotificationListScreen />);
    await fireEvent.press(await screen.findByText('Order status updated: Confirmed'));

    expect(mockMarkRead).toHaveBeenCalledWith('notif-1');
    expect(mockGetParentNavigate).toHaveBeenCalledWith(APP_TABS.Orders, {
      screen: ORDERS_ROUTES.OrderDetail,
      params: { orderId: 'order-1' },
      initial: false,
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
      initial: false,
    });
  });

  it('shows Mark all as read only when there are unread notifications, and calls markAllRead', async () => {
    mockFetchNotifications.mockResolvedValue([notification({ read: false })]);
    await renderWithQuery(<NotificationListScreen />);
    await screen.findByText('Order status updated: Confirmed');

    expect(screen.getByText('Mark all as read')).toBeTruthy();
    await fireEvent.press(screen.getByText('Mark all as read'));
    expect(mockMarkAllRead).toHaveBeenCalledTimes(1);
  });

  // FA-12: the expert's main event opens the case.
  it('opens the consultation for a consultation request', async () => {
    mockFetchNotifications.mockResolvedValue([notification({ id: 'n-k', type: 'consultation_new', payload: { consultation_id: 'k1' } })]);
    await renderWithQuery(<NotificationListScreen />);
    await fireEvent.press(await screen.findByText('New consultation request'));

    expect(mockMarkRead).toHaveBeenCalledWith('n-k');
    expect(mockGetParentNavigate).toHaveBeenCalledWith(APP_TABS.Consultations, {
      screen: CONSULTATIONS_ROUTES.ConsultationDetail,
      params: { consultationId: 'k1' },
      initial: false,
    });
  });

  it('only clears the dot of a notification that has nowhere to go', async () => {
    mockFetchNotifications.mockResolvedValue([notification({ id: 'n-x', type: 'something_new', payload: {} })]);
    await renderWithQuery(<NotificationListScreen />);
    await fireEvent.press(await screen.findByText('Notification'));

    expect(mockMarkRead).toHaveBeenCalledWith('n-x');
    expect(mockGetParentNavigate).not.toHaveBeenCalled();
  });

  // FA-20: today first, then everything before, each under its own heading.
  it('groups notifications under Today and Earlier', async () => {
    mockFetchNotifications.mockResolvedValue([
      notification({ id: 'n-new', payload: { order_id: 'o1', status: 'ready' } }),
      notification({ id: 'n-old', type: 'order_new', payload: { order_id: 'o2' }, created_at: '2020-03-04T09:00:00.000Z', read: true }),
    ]);
    await renderWithQuery(<NotificationListScreen />);
    await screen.findByText('Order status updated: Ready for dispatch');

    const headings = screen.getAllByRole('header').map(node => node.props.children);
    expect(headings).toEqual(['Today', 'Earlier']);
    expect(screen.getByText('Just now')).toBeTruthy();
    expect(screen.getByText('4 Mar 2020')).toBeTruthy();
  });

  it('shows no Earlier heading when everything is from today', async () => {
    mockFetchNotifications.mockResolvedValue([notification()]);
    await renderWithQuery(<NotificationListScreen />);
    await screen.findByText('Order status updated: Confirmed');
    expect(screen.queryByText('Earlier')).toBeNull();
  });

  it('shows a pending state on Mark all as read while it runs', async () => {
    mockFetchNotifications.mockResolvedValue([notification()]);
    let finish: () => void = () => {};
    mockMarkAllRead.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
    await renderWithQuery(<NotificationListScreen />);
    await fireEvent.press(await screen.findByText('Mark all as read'));

    await waitFor(() => expect(screen.getByLabelText('Mark all as read').props.accessibilityState.disabled).toBe(true));
    finish();
  });

  it('says when marking everything as read failed, and offers to try again', async () => {
    mockFetchNotifications.mockResolvedValue([notification()]);
    mockMarkAllRead.mockRejectedValueOnce(new Error('offline'));
    await renderWithQuery(<NotificationListScreen />);
    await fireEvent.press(await screen.findByText('Mark all as read'));
    expect(await screen.findByText("Couldn't mark them as read")).toBeTruthy();

    mockMarkAllRead.mockResolvedValue(undefined);
    await fireEvent.press(screen.getByText('Try again'));
    await waitFor(() => expect(screen.queryByText("Couldn't mark them as read")).toBeNull());
  });

  it('hides Mark all as read when everything is already read', async () => {
    mockFetchNotifications.mockResolvedValue([notification({ read: true })]);
    await renderWithQuery(<NotificationListScreen />);
    await screen.findByText('Order status updated: Confirmed');

    expect(screen.queryByText('Mark all as read')).toBeNull();
  });
});
