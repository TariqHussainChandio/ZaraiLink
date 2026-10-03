import { renderHook } from '@testing-library/react-native';
import { supabase } from '../../services/supabase/client';
import { useRealtimeNotifications } from './useRealtimeNotifications';

// The real supabase-js client, not a mock: the crash this guards against came from supabase-js itself, which hands back
// the already-subscribed channel when a topic repeats and throws when a second listener is added to it. The app bar
// bell and the notification list are mounted at the same time, so the hook must survive two mounts.
afterEach(async () => {
  await supabase.removeAllChannels();
});

describe('useRealtimeNotifications', () => {
  it('subscribes twice for the same user without throwing, one channel each', async () => {
    const first = await renderHook(() => useRealtimeNotifications('user-1', () => undefined));
    const second = await renderHook(() => useRealtimeNotifications('user-1', () => undefined));
    const topics = supabase.getChannels().map(channel => channel.topic);
    expect(topics.filter(topic => topic.startsWith('realtime:notifications:user-1:'))).toHaveLength(2);

    await first.unmount();
    expect(supabase.getChannels()).toHaveLength(1);
    await second.unmount();
    expect(supabase.getChannels()).toHaveLength(0);
  });

  it('does not subscribe before anyone is signed in', async () => {
    await renderHook(() => useRealtimeNotifications(undefined, () => undefined));
    expect(supabase.getChannels()).toHaveLength(0);
  });
});
