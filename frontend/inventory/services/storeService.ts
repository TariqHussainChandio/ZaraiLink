import { apiFetch } from '../../services/api/client';
import type { DealerEntityStatus, DealerStore } from '../types/dealer';

export interface StoreInput {
  name: string;
  address: string | null;
  contact: string | null;
  openingInfo: string | null;
  status: DealerEntityStatus;
  country: string | null;
  province: string | null;
  city: string | null;
}

function toApiStore(input: Partial<StoreInput>) {
  return {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.address !== undefined && { address: input.address }),
    ...(input.contact !== undefined && { contact: input.contact }),
    ...(input.openingInfo !== undefined && { opening_info: input.openingInfo }),
    ...(input.status !== undefined && { status: input.status }),
    ...(input.country !== undefined && { country: input.country }),
    ...(input.province !== undefined && { province: input.province }),
    ...(input.city !== undefined && { city: input.city }),
  };
}

// No dealerId param — always the caller's own stores.
export async function fetchStores(): Promise<DealerStore[]> {
  return apiFetch('/api/v1/dealer/stores');
}

export async function fetchStoreById(id: string): Promise<DealerStore> {
  return apiFetch(`/api/v1/dealer/stores/${id}`);
}

export async function createStore(input: StoreInput): Promise<DealerStore> {
  return apiFetch('/api/v1/dealer/stores', { method: 'POST', body: toApiStore(input) });
}

export async function updateStore(id: string, input: Partial<StoreInput>): Promise<DealerStore> {
  return apiFetch(`/api/v1/dealer/stores/${id}`, { method: 'PATCH', body: toApiStore(input) });
}

export async function deleteStore(id: string): Promise<void> {
  await apiFetch(`/api/v1/dealer/stores/${id}`, { method: 'DELETE' });
}
