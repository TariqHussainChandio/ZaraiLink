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
  /** The user the items belong to, or `null` for a guest's cart (D18: anyone may browse and fill a cart; an account is
   * needed only to check out). The cart is kept on the device, so without it the next account to sign in on the same
   * phone saw (and could order) the previous one's lines (B3 verification, cart leak). */
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
      // Version 1 (D18) gives a guest's cart the owner `null`. A version-0 cart saved without an owner predates owners
      // altogether, so it may be anyone's lines: it is dropped rather than adopted as a guest's.
      version: 1,
      migrate: (persisted, version) => {
        const saved = persisted as Partial<Pick<CartState, 'items' | 'ownerId'>> | null;
        if (version === 0 && !saved?.ownerId) return { items: [], ownerId: null };
        return { items: saved?.items ?? [], ownerId: saved?.ownerId ?? null };
      },
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
 * Gives the cart to whoever is signed in now. A guest's cart (owner `null`) goes with the guest into the account they
 * sign in to or create, so what they picked before signing in is still there at checkout (D18). Another user's lines,
 * and every line after a sign-out, are dropped. Waits while the session is still being restored.
 */
function claimCart(): void {
  const { user, status } = useAuthStore.getState();
  // Before the saved cart is read, a write here would overwrite it on disk; the rehydrate hook calls back instead.
  if (status === 'loading' || !cartRead) return;
  const userId = user?.id ?? null;
  const ownerId = useCartStore.getState().ownerId;
  if (ownerId === userId) return;
  if (ownerId === null) {
    useCartStore.setState({ ownerId: userId });
    return;
  }
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
