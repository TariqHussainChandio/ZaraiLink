import { create } from 'zustand';
import { fetchCategories, fetchCrops } from '../services/modules/marketplace/listingsService';
import type { Category, Crop } from '../types/marketplace';

export interface MarketplaceFilters {
  categoryId: string | null;
  search: string;
  minPrice: number | null;
  maxPrice: number | null;
  cityId: string | null;
  cropName: string | null;
}

interface MarketplaceState {
  filters: MarketplaceFilters;
  categories: Category[];
  categoriesLoaded: boolean;
  crops: Crop[];
  cropsLoaded: boolean;
  setFilters: (filters: Partial<MarketplaceFilters>) => void;
  resetFilters: () => void;
  loadCategories: () => Promise<void>;
  loadCrops: () => Promise<void>;
}

const defaultFilters: MarketplaceFilters = {
  categoryId: null,
  search: '',
  minPrice: null,
  maxPrice: null,
  cityId: null,
  cropName: null,
};

export const useMarketplaceStore = create<MarketplaceState>((set, get) => ({
  filters: defaultFilters,
  categories: [],
  categoriesLoaded: false,
  crops: [],
  cropsLoaded: false,

  setFilters: filters => set(state => ({ filters: { ...state.filters, ...filters } })),
  resetFilters: () => set({ filters: defaultFilters }),

  loadCategories: async () => {
    if (get().categoriesLoaded) return;
    const categories = await fetchCategories();
    set({ categories, categoriesLoaded: true });
  },

  loadCrops: async () => {
    if (get().cropsLoaded) return;
    const crops = await fetchCrops();
    set({ crops, cropsLoaded: true });
  },
}));
