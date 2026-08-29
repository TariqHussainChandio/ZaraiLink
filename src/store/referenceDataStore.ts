import { create } from 'zustand';
import {
  fetchCities,
  fetchCountries,
  fetchCurrencies,
  fetchPhoneCodes,
  fetchProvinces,
  fetchUnits,
} from '../services/modules/reference-data/referenceDataService';
import type { City, Country, Currency, PhoneCode, Province, Unit } from '../types/referenceData';

interface ReferenceDataState {
  countries: Country[];
  countriesLoaded: boolean;
  provincesByCountry: Record<string, Province[]>;
  citiesByProvince: Record<string, City[]>;
  phoneCodes: PhoneCode[];
  phoneCodesLoaded: boolean;
  currencies: Currency[];
  currenciesLoaded: boolean;
  units: Unit[];
  unitsLoaded: boolean;

  loadCountries: () => Promise<void>;
  loadProvinces: (countryId: string) => Promise<void>;
  loadCities: (provinceId: string) => Promise<void>;
  loadPhoneCodes: () => Promise<void>;
  loadCurrencies: () => Promise<void>;
  loadUnits: () => Promise<void>;
  /** Called by `ReferenceDataScreen` (Module 18) after any admin create/update/delete, so
   * `LocationPicker`/`PhoneInput` elsewhere re-fetch fresh data next time instead of serving
   * this session's stale one-time cache. */
  invalidateAll: () => void;
}

export const useReferenceDataStore = create<ReferenceDataState>((set, get) => ({
  countries: [],
  countriesLoaded: false,
  provincesByCountry: {},
  citiesByProvince: {},
  phoneCodes: [],
  phoneCodesLoaded: false,
  currencies: [],
  currenciesLoaded: false,
  units: [],
  unitsLoaded: false,

  loadCountries: async () => {
    if (get().countriesLoaded) return;
    const countries = await fetchCountries();
    set({ countries, countriesLoaded: true });
  },

  loadProvinces: async countryId => {
    if (get().provincesByCountry[countryId]) return;
    const provinces = await fetchProvinces(countryId);
    set(state => ({ provincesByCountry: { ...state.provincesByCountry, [countryId]: provinces } }));
  },

  loadCities: async provinceId => {
    if (get().citiesByProvince[provinceId]) return;
    const cities = await fetchCities(provinceId);
    set(state => ({ citiesByProvince: { ...state.citiesByProvince, [provinceId]: cities } }));
  },

  loadPhoneCodes: async () => {
    if (get().phoneCodesLoaded) return;
    const phoneCodes = await fetchPhoneCodes();
    set({ phoneCodes, phoneCodesLoaded: true });
  },

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
      countries: [],
      countriesLoaded: false,
      provincesByCountry: {},
      citiesByProvince: {},
      phoneCodes: [],
      phoneCodesLoaded: false,
      currencies: [],
      currenciesLoaded: false,
      units: [],
      unitsLoaded: false,
    });
  },
}));
