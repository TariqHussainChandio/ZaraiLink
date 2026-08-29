import { apiFetch } from '../../api/client';
import type { DealerEntityStatus, Supplier } from '../../../types/dealer';

export interface SupplierInput {
  name: string;
  contact: string | null;
  productsSupplied: string | null;
  notes: string | null;
  status: DealerEntityStatus;
}

function toApiSupplier(input: Partial<SupplierInput>) {
  return {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.contact !== undefined && { contact: input.contact }),
    ...(input.productsSupplied !== undefined && { products_supplied: input.productsSupplied }),
    ...(input.notes !== undefined && { notes: input.notes }),
    ...(input.status !== undefined && { status: input.status }),
  };
}

// No dealerId param — always the caller's own suppliers.
export async function fetchSuppliers(): Promise<Supplier[]> {
  return apiFetch('/api/v1/dealer/suppliers');
}

export async function fetchSupplierById(id: string): Promise<Supplier> {
  return apiFetch(`/api/v1/dealer/suppliers/${id}`);
}

export async function createSupplier(input: SupplierInput): Promise<Supplier> {
  return apiFetch('/api/v1/dealer/suppliers', { method: 'POST', body: toApiSupplier(input) });
}

export async function updateSupplier(id: string, input: Partial<SupplierInput>): Promise<Supplier> {
  return apiFetch(`/api/v1/dealer/suppliers/${id}`, { method: 'PATCH', body: toApiSupplier(input) });
}

export async function deleteSupplier(id: string): Promise<void> {
  await apiFetch(`/api/v1/dealer/suppliers/${id}`, { method: 'DELETE' });
}
