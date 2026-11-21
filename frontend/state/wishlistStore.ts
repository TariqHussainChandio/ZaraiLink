import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** What the wishlist screen shows without asking the server: enough to draw the row and open the listing. */
export interface WishlistItem {
  listingId: string;
  title: string;
  price: number;
  unit: string;
  image: string | null;
  sellerName: string | null;
}

interface WishlistState {
  /** Each account's saved listings, by user id. D20: the wishlist stays on the phone, like the cart, so it is kept per
   * account: a second person signing in on the same phone never sees the first one's list. */
  byUser: Record<string, WishlistItem[]>;
  toggle: (userId: string, item: WishlistItem) => void;
  remove: (userId: string, listingId: string) => void;
}

export const useWishlistStore = create<WishlistState>()(
  persist(
    (set, get) => ({
      byUser: {},

      toggle: (userId, item) => {
        const items = get().byUser[userId] ?? [];
        const saved = items.some(i => i.listingId === item.listingId);
        // Newest first: the listing just saved is the first one on the wishlist screen.
        const next = saved ? items.filter(i => i.listingId !== item.listingId) : [item, ...items];
        set({ byUser: { ...get().byUser, [userId]: next } });
      },

      remove: (userId, listingId) => {
        const items = get().byUser[userId] ?? [];
        set({ byUser: { ...get().byUser, [userId]: items.filter(i => i.listingId !== listingId) } });
      },
    }),
    { name: 'zarailink-wishlist', storage: createJSONStorage(() => AsyncStorage), version: 1 },
  ),
);

const NONE: WishlistItem[] = [];

/** One account's saved listings; an empty list when signed out. */
export function useWishlist(userId: string | undefined): WishlistItem[] {
  return useWishlistStore(state => (userId ? (state.byUser[userId] ?? NONE) : NONE));
}
