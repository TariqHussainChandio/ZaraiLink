import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useAuthStore } from './authStore';

export interface CartItem {
  listingId: string;
  sellerId: string;
  title: string;
  price: number;
  unit: string;
  image: string | null;
  quantity: number;
}

interface CartState {
  items: CartItem[];
  /** The user the items belong to. The cart is kept on the device, so without it the next account to sign in on the
   * same phone saw (and could order) the previous one's lines (B3 verification, cart leak). */
  ownerId: string | null;
  addItem: (item: Omit<CartItem, 'quantity'>, quantity?: number) => void;
  removeItem: (listingId: string) => void;
  updateQuantity: (listingId: string, quantity: number) => void;
  clear: () => void;
}

/** Set once the saved cart has been read (or the read failed). zustand reports `hasHydrated()` only after the
 * rehydrate callback has run, so the callback could not rely on it. */
let cartRead = false;

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      ownerId: null,

      addItem: (item, quantity = 1) => {
        const existing = get().items.find(i => i.listingId === item.listingId);
        if (existing) {
          set({
            items: get().items.map(i =>
              i.listingId === item.listingId ? { ...i, quantity: i.quantity + quantity } : i,
            ),
          });
          return;
        }
        set({ items: [...get().items, { ...item, quantity }] });
      },

      removeItem: listingId => set({ items: get().items.filter(i => i.listingId !== listingId) }),

      updateQuantity: (listingId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(listingId);
          return;
        }
        set({
          items: get().items.map(i => (i.listingId === listingId ? { ...i, quantity } : i)),
        });
      },

      clear: () => set({ items: [] }),
    }),
    {
      name: 'zarailink-cart',
      storage: createJSONStorage(() => AsyncStorage),
      // The saved cart can come back from disk after the session is already known (a cold start); it is checked
      // against that session once it lands. Also called when the read failed, so the cart is never left unclaimed.
      onRehydrateStorage: () => () => {
        cartRead = true;
        claimCart();
      },
    },
  ),
);

/**
 * Gives the cart to whoever is signed in now: another user's lines, lines with no recorded owner (saved before the
 * owner was kept) and every line after a sign-out are dropped. Waits while the session is still being restored.
 */
function claimCart(): void {
  const { user, status } = useAuthStore.getState();
  // Before the saved cart is read, a write here would overwrite it on disk; the rehydrate hook calls back instead.
  if (status === 'loading' || !cartRead) return;
  const userId = user?.id ?? null;
  if (useCartStore.getState().ownerId === userId) return;
  useCartStore.setState({ items: [], ownerId: userId });
}

/** Keeps the cart with its owner across sign-out, expiry and account switches; call once on app mount. */
export function connectCartToAuth(): () => void {
  claimCart();
  return useAuthStore.subscribe((state, previous) => {
    if (state.user?.id !== previous.user?.id || state.status !== previous.status) claimCart();
  });
}

export function cartTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

export function cartItemCount(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}
