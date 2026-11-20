import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react-native';
import { useNetworkStore } from '../state/networkStore';
import { canReachBackend, connectQueryManagers } from './queryClient';

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(() => jest.fn()) },
}));

// The listener the app registered with NetInfo.
async function deviceReports(state: Partial<NetInfoState>) {
  const listeners = (NetInfo.addEventListener as jest.Mock).mock.calls.map(call => call[0] as (s: unknown) => void);
  await act(async () => {
    listeners.forEach(listener => listener(state));
  });
}

// The backend's health check, faked at the network edge: the only request the connection check makes.
const backendAnswers = (status: number) => jest.fn(() => Promise.resolve({ status } as Response));
const networkFails = () => jest.fn(() => Promise.reject(new TypeError('Network request failed')));

let disconnect: () => void;
const realFetch = globalThis.fetch;

beforeEach(() => {
  (NetInfo.addEventListener as jest.Mock).mockClear();
  useNetworkStore.setState({ isOffline: false });
  onlineManager.setOnline(true);
  globalThis.fetch = networkFails() as never;
  disconnect = connectQueryManagers();
});

afterEach(() => {
  disconnect();
  globalThis.fetch = realFetch;
});

describe('canReachBackend', () => {
  it('asks Supabase Auth health, with the anon key', async () => {
    const fetchMock = backendAnswers(200);
    globalThis.fetch = fetchMock as never;
    await expect(canReachBackend()).resolves.toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/auth\/v1\/health$/);
    expect((init.headers as Record<string, string>).apikey).toBeTruthy();
  });

  it('counts any answer below 500 as reachable, and a server error or no answer as not', async () => {
    globalThis.fetch = backendAnswers(401) as never;
    await expect(canReachBackend()).resolves.toBe(true);
    globalThis.fetch = backendAnswers(503) as never;
    await expect(canReachBackend()).resolves.toBe(false);
    globalThis.fetch = networkFails() as never;
    await expect(canReachBackend()).resolves.toBe(false);
  });
});

describe('the offline banner follows whether the backend can be reached', () => {
  it('shows when the device loses its connection and the backend cannot be reached', async () => {
    await deviceReports({ isConnected: false, isInternetReachable: false });

    await waitFor(() => expect(useNetworkStore.getState().isOffline).toBe(true));
    expect(onlineManager.isOnline()).toBe(false);
  });

  it('shows when there is a network but no internet behind it', async () => {
    await deviceReports({ isConnected: true, isInternetReachable: false });

    await waitFor(() => expect(useNetworkStore.getState().isOffline).toBe(true));
  });

  // A Xiaomi phone on mobile data (2026-11-20): NetInfo said offline while the app's requests went through.
  it('stays online when NetInfo says offline but the backend answers', async () => {
    globalThis.fetch = backendAnswers(200) as never;
    await deviceReports({ isConnected: false, isInternetReachable: false });

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(useNetworkStore.getState().isOffline).toBe(false);
    expect(onlineManager.isOnline()).toBe(true);
  });

  it('clears when the connection returns', async () => {
    await deviceReports({ isConnected: false, isInternetReachable: false });
    await waitFor(() => expect(useNetworkStore.getState().isOffline).toBe(true));
    await deviceReports({ isConnected: true, isInternetReachable: true });

    expect(useNetworkStore.getState().isOffline).toBe(false);
    expect(onlineManager.isOnline()).toBe(true);
  });

  it('treats a connection NetInfo has not worked out yet as online, without asking the backend', async () => {
    await deviceReports({ isConnected: true, isInternetReachable: null });

    expect(useNetworkStore.getState().isOffline).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('stops listening when disconnected', () => {
    const unsubscribe = (NetInfo.addEventListener as jest.Mock).mock.results.map(result => result.value as jest.Mock);
    disconnect();

    expect(unsubscribe.some(fn => fn.mock.calls.length > 0)).toBe(true);
  });
});
