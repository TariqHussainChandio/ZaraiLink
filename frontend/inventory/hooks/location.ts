import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMemo } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { useAuthStore } from '../../state/authStore';
import type { InventoryLocation } from '../types/inventory';
import { useLocations } from './inventory';

interface SelectedLocationState {
  /** The location the dealer on this phone last chose, keyed by their user id so another account never inherits it. */
  byDealer: Record<string, string>;
  select: (dealerId: string, locationId: string) => void;
}

// Kept on the device like the theme choice (state/themeStore.ts). Only an id: the location itself comes from the
// cached locations query, so a removed location simply falls back to the default one. Only the last dealer's choice is
// kept (BR-03/04: nothing of dealer A stays for dealer B), and it is read only under the same user id.
const useSelectedLocationStore = create<SelectedLocationState>()(
  persist(
    set => ({
      byDealer: {},
      select: (dealerId, locationId) => set({ byDealer: { [dealerId]: locationId } }),
    }),
    { name: 'zarailink-inventory-location', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

export interface SelectedLocation {
  /** The chosen location, or the default one when nothing (or a location since removed) was chosen. */
  location: InventoryLocation | null;
  /** Active locations, the choices of the switcher and the operation forms. */
  locations: InventoryLocation[];
  isPending: boolean;
  select: (locationId: string) => void;
}

/** The location the shell's switcher has chosen: the Stock tab shows it and new operations start from it. */
export function useSelectedLocation(): SelectedLocation {
  const dealerId = useAuthStore(state => state.user?.id) ?? '';
  const storedId = useSelectedLocationStore(state => state.byDealer[dealerId]);
  const select = useSelectedLocationStore(state => state.select);
  const { data, isPending } = useLocations();

  return useMemo(() => {
    const locations = (data ?? []).filter(location => location.is_active);
    const location =
      locations.find(item => item.id === storedId) ?? locations.find(item => item.is_default) ?? locations[0] ?? null;
    return { location, locations, isPending, select: (locationId: string) => select(dealerId, locationId) };
  }, [data, storedId, isPending, select, dealerId]);
}
