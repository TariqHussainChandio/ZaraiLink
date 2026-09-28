import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

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
  addItem: (item: Omit<CartItem, 'quantity'>, quantity?: number) => void;
  removeItem: (listingId: string) => void;
  updateQuantity: (listingId: string, quantity: number) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

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
    },
  ),
);

export function cartTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

export function cartItemCount(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}
