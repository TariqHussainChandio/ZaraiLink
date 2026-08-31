import { apiFetch } from '../../api/client';
import type { Currency, Unit } from '../../../types/referenceData';

export async function fetchCurrencies(): Promise<Currency[]> {
  return apiFetch('/api/v1/reference-data/currencies');
}

export async function fetchUnits(): Promise<Unit[]> {
  return apiFetch('/api/v1/reference-data/units');
}

/**
 * The two tables above are small, structurally-similar lookup tables that both already got the
 * same generic `<table>_admin_write` RLS policy from one dynamic policy-generation loop
 * (Module 4/5's migration) — one generic set of write functions mirrors that, instead of
 * near-duplicate `createCurrency`/`updateCurrency`/`deleteCurrency`/... functions.
 */
export type RefDataTable = 'currencies' | 'units';

/**
 * Unfiltered read of either table, for `ReferenceDataScreen`'s own list — the `fetch*`
 * functions above are scoped for picker consumption elsewhere and don't fit that use.
 */
export async function fetchRefDataRows(table: RefDataTable): Promise<Record<string, unknown>[]> {
  return apiFetch(`/api/v1/reference-data/${table}/rows`);
}

// No `actorId` param — the backend derives the acting admin from the verified session token
// (never from a client-supplied value) and writes the audit_logs row itself.
export async function createRefDataRow(table: RefDataTable, row: Record<string, unknown>): Promise<void> {
  await apiFetch(`/api/v1/reference-data/${table}/rows`, { method: 'POST', body: row });
}

export async function updateRefDataRow(
  table: RefDataTable,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await apiFetch(`/api/v1/reference-data/${table}/rows/${id}`, { method: 'PATCH', body: patch });
}

export async function deleteRefDataRow(table: RefDataTable, id: string): Promise<void> {
  await apiFetch(`/api/v1/reference-data/${table}/rows/${id}`, { method: 'DELETE' });
}
