import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react-native';
import React from 'react';
import { supabase } from '../../services/supabase/client';
import { createTestQueryClient } from '../../testUtils/renderWithProviders';
import { queryKeys } from '../keys';
import { useRealtimeMessages } from './useRealtimeMessages';

// The real supabase-js client (as in useRealtimeNotifications.test): the same conversation can be mounted twice, and
// supabase-js throws when a second listener is added to a channel that is already subscribed.
afterEach(async () => {
  await supabase.removeAllChannels();
});

const wrapperFor = (client: ReturnType<typeof createTestQueryClient>) =>
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };

describe('useRealtimeMessages', () => {
  it('subscribes twice to the same conversation without throwing, one channel each', async () => {
    const wrapper = wrapperFor(createTestQueryClient());
    const first = await renderHook(() => useRealtimeMessages('c-1', () => undefined), { wrapper });
    const second = await renderHook(() => useRealtimeMessages('c-1', () => undefined), { wrapper });
    expect(supabase.getChannels().filter(channel => channel.topic.startsWith('realtime:messages:c-1:'))).toHaveLength(2);
    await first.unmount();
    await second.unmount();
    expect(supabase.getChannels()).toHaveLength(0);
  });

  it('listens for INSERT and UPDATE on messages, and an UPDATE patches read_at in the cached list', async () => {
    const client = createTestQueryClient();
    const key = queryKeys.messaging.messages('c-1');
    client.setQueryData(key, [
      { id: 'm1', body: 'hi', read_at: null },
      { id: 'm2', body: 'there', read_at: null },
    ]);
    await renderHook(() => useRealtimeMessages('c-1', () => undefined), { wrapper: wrapperFor(client) });

    const channel = supabase.getChannels()[0] as unknown as {
      bindings: { postgres_changes?: { filter: { event: string; table: string }; callback: (payload: { new: unknown }) => void }[] };
    };
    const bindings = channel.bindings.postgres_changes ?? [];
    expect(bindings.map(binding => binding.filter.event).sort()).toEqual(['INSERT', 'UPDATE']);
    bindings.find(binding => binding.filter.event === 'UPDATE')?.callback({ new: { id: 'm1', read_at: '2026-11-08T10:00:00Z' } });

    expect(client.getQueryData(key)).toEqual([
      { id: 'm1', body: 'hi', read_at: '2026-11-08T10:00:00Z' },
      { id: 'm2', body: 'there', read_at: null },
    ]);
  });
});
