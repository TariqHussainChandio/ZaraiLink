import { create } from 'zustand';
import { useAuthStore } from './authStore';

/**
 * The marketplace filters the buyer has set: client state, so it lives in a store. Categories, crops and listings are
 * server data and are read through the query hooks in `frontend/common/marketplace/hooks/marketplace.ts`.
 */
export interface MarketplaceFilters {
  categoryId: string | null;
  search: string;
  minPrice: number | null;
  maxPrice: number | null;
  city: string | null;
  cropName: string | null;
}

interface MarketplaceState {
  filters: MarketplaceFilters;
  setFilters: (filters: Partial<MarketplaceFilters>) => void;
  resetFilters: () => void;
}

const defaultFilters: MarketplaceFilters = {
  categoryId: null,
  search: '',
  minPrice: null,
  maxPrice: null,
  city: null,
  cropName: null,
};

export const useMarketplaceStore = create<MarketplaceState>(set => ({
  filters: defaultFilters,

  setFilters: filters => set(state => ({ filters: { ...state.filters, ...filters } })),
  resetFilters: () => set({ filters: defaultFilters }),
}));

/** A search or filter one account typed must not greet the next account on the phone (B3 verifier), as with the cart. */
export function connectMarketplaceToAuth(): () => void {
  return useAuthStore.subscribe((state, previous) => {
    if (state.user?.id !== previous.user?.id) useMarketplaceStore.getState().resetFilters();
  });
}
