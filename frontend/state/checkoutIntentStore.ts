import { create } from 'zustand';
import { useAuthStore } from './authStore';

/**
 * A guest who pressed "Go to checkout" (D18). Signing in swaps the whole navigator, so a route parameter cannot carry
 * the wish across; this flag does, and the marketplace stack of the signed-in shell takes it to reopen the cart. It is
 * memory only: after a restart the person simply lands on their home screen, with the cart still kept (cartStore).
 */
interface CheckoutIntentState {
  pending: boolean;
  request: () => void;
  /** Returns whether a checkout was waiting, and forgets it, so the cart is reopened once. */
  take: () => boolean;
}

export const useCheckoutIntent = create<CheckoutIntentState>((set, get) => ({
  pending: false,
  request: () => set({ pending: true }),
  take: () => {
    const pending = get().pending;
    if (pending) set({ pending: false });
    return pending;
  },
}));

/** Only a farmer, buyer or dealer can buy (D9); anyone else signing in, or a sign-out, forgets the wish. */
export function connectCheckoutIntentToAuth(): () => void {
  return useAuthStore.subscribe((state, previous) => {
    if (!useCheckoutIntent.getState().pending) return;
    const signedOut = previous.user !== null && state.user === null;
    const cannotBuy = state.status === 'authenticated' && state.role !== null && !['farmer', 'buyer', 'dealer'].includes(state.role);
    if (signedOut || cannotBuy) useCheckoutIntent.setState({ pending: false });
  });
}
