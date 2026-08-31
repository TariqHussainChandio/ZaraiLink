import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { NotificationBellButton } from './NotificationBellButton';
import { useAuthStore } from '../../../store/authStore';
import { fetchUnreadCount } from '../../../services/modules/notifications/notificationsService';

jest.mock('../../../services/supabase/client', () => {
  const { makeSupabaseMock } = jest.requireActual('../../../testUtils/supabaseMock');
  return { supabase: makeSupabaseMock() };
});

jest.mock('../../../services/modules/notifications/notificationsService', () => ({
  fetchUnreadCount: jest.fn(),
}));

const mockFetchUnreadCount = fetchUnreadCount as jest.Mock;

describe('NotificationBellButton', () => {
  beforeEach(() => {
    mockFetchUnreadCount.mockReset();
    useAuthStore.setState({ user: { id: 'u1' } as never });
  });

  it('renders without a badge when there are no unread notifications', async () => {
    mockFetchUnreadCount.mockResolvedValue(0);
    await render(<NotificationBellButton onPress={() => {}} />);
    expect(await screen.findByLabelText('Notifications')).toBeTruthy();
  });

  it('shows the unread count in the badge and accessibility label', async () => {
    mockFetchUnreadCount.mockResolvedValue(3);
    await render(<NotificationBellButton onPress={() => {}} />);
    expect(await screen.findByLabelText('Notifications, 3 unread')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('caps the displayed badge at "9+"', async () => {
    mockFetchUnreadCount.mockResolvedValue(15);
    await render(<NotificationBellButton onPress={() => {}} />);
    expect(await screen.findByText('9+')).toBeTruthy();
  });

  it('calls onPress when tapped', async () => {
    mockFetchUnreadCount.mockResolvedValue(0);
    const onPress = jest.fn();
    await render(<NotificationBellButton onPress={onPress} />);
    await screen.findByLabelText('Notifications');
    fireEvent.press(screen.getByLabelText('Notifications'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
