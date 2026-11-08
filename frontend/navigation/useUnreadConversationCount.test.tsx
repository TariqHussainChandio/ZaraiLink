import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useAuthStore } from '../state/authStore';
import { createTestQueryClient } from '../testUtils/renderWithProviders';
import { useUnreadConversationCount } from './useUnreadConversationCount';

const mockConversation = (id: string, last: { sender_id: string; read_at: string | null } | null) => ({ id, lastMessage: last });
const mockList = [
  mockConversation('a', { sender_id: 'them', read_at: null }),
  mockConversation('b', { sender_id: 'them', read_at: '2026-11-08T10:00:00Z' }),
  mockConversation('c', { sender_id: 'me', read_at: null }),
  mockConversation('d', null),
  mockConversation('e', { sender_id: 'them', read_at: null }),
];

jest.mock('../common/messaging/services/messagingService', () => ({ fetchConversations: jest.fn(async () => mockList) }));

describe('useUnreadConversationCount', () => {
  it('counts conversations whose last message is from the other person and unread', async () => {
    useAuthStore.setState({ user: { id: 'me' } as never });
    const client = createTestQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = await renderHook(() => useUnreadConversationCount(), { wrapper });
    await waitFor(() => expect(result.current).toBe(2));
  });

  it('is zero when nobody is signed in', async () => {
    useAuthStore.setState({ user: null });
    const client = createTestQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = await renderHook(() => useUnreadConversationCount(), { wrapper });
    expect(result.current).toBe(0);
  });
});
