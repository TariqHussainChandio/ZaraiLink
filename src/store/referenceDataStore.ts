import { create } from 'zustand';
import { fetchCurrencies, fetchUnits } from '../services/modules/reference-data/referenceDataService';
import type { Currency, Unit } from '../types/referenceData';

interface ReferenceDataState {
  currencies: Currency[];
  currenciesLoaded: boolean;
  units: Unit[];
  unitsLoaded: boolean;

  loadCurrencies: () => Promise<void>;
  loadUnits: () => Promise<void>;
  /** Called by `ReferenceDataScreen` (Module 18) after any admin create/update/delete, so
   * consumers elsewhere re-fetch fresh data next time instead of serving this session's stale
   * one-time cache. */
  invalidateAll: () => void;
}

export const useReferenceDataStore = create<ReferenceDataState>((set, get) => ({
  currencies: [],
  currenciesLoaded: false,
  units: [],
  unitsLoaded: false,

  loadCurrencies: async () => {
    if (get().currenciesLoaded) return;
    const currencies = await fetchCurrencies();
    set({ currencies, currenciesLoaded: true });
  },

  loadUnits: async () => {
    if (get().unitsLoaded) return;
    const units = await fetchUnits();
    set({ units, unitsLoaded: true });
  },

  invalidateAll: () => {
    set({
      currencies: [],
      currenciesLoaded: false,
      units: [],
      unitsLoaded: false,
    });
  },
}));
