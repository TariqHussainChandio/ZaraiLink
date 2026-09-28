import { create } from 'zustand';

// P4 (4B.2): apiFetch flips this on a network-level failure (no response at all — offline, DNS,
// unreachable host) and clears it the moment any request succeeds again. A screen-level error from
// a real HTTP response (4xx/5xx) never touches this — that's a reachable-but-rejected request, not
// "offline", and stays exactly the caller's own error handling.
interface NetworkState {
  isOffline: boolean;
  setOffline: (isOffline: boolean) => void;
}

export const useNetworkStore = create<NetworkState>(set => ({
  isOffline: false,
  setOffline: isOffline => set({ isOffline }),
}));
