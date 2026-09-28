import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { useNetworkStore } from '../state/networkStore';
import { connectQueryManagers } from './queryClient';

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(() => jest.fn()) },
}));

// The listeners the app registered with NetInfo: one for React Query, one for the offline banner.
function deviceReports(state: Partial<NetInfoState>) {
  const listeners = (NetInfo.addEventListener as jest.Mock).mock.calls.map(call => call[0] as (s: unknown) => void);
  listeners.forEach(listener => listener(state));
}

let disconnect: () => void;

beforeEach(() => {
  (NetInfo.addEventListener as jest.Mock).mockClear();
  useNetworkStore.setState({ isOffline: false });
  disconnect = connectQueryManagers();
});

afterEach(() => disconnect());

describe('the offline banner follows the device connection', () => {
  it('shows when the device loses its connection, before any request fails', () => {
    deviceReports({ isConnected: false, isInternetReachable: false });

    expect(useNetworkStore.getState().isOffline).toBe(true);
    expect(onlineManager.isOnline()).toBe(false);
  });

  it('shows when there is a network but no internet behind it', () => {
    deviceReports({ isConnected: true, isInternetReachable: false });

    expect(useNetworkStore.getState().isOffline).toBe(true);
  });

  it('clears when the connection returns', () => {
    deviceReports({ isConnected: false, isInternetReachable: false });
    deviceReports({ isConnected: true, isInternetReachable: true });

    expect(useNetworkStore.getState().isOffline).toBe(false);
    expect(onlineManager.isOnline()).toBe(true);
  });

  it('treats a connection NetInfo has not worked out yet as online', () => {
    deviceReports({ isConnected: true, isInternetReachable: null });

    expect(useNetworkStore.getState().isOffline).toBe(false);
  });

  it('stops listening when disconnected', () => {
    const unsubscribe = (NetInfo.addEventListener as jest.Mock).mock.results.map(result => result.value as jest.Mock);
    disconnect();

    expect(unsubscribe.some(fn => fn.mock.calls.length > 0)).toBe(true);
  });
});
