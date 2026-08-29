import { apiFetch } from '../../api/client';
import type { City, Country, Currency, PhoneCode, Province, Unit } from '../../../types/referenceData';

export async function fetchCountries(): Promise<Country[]> {
  return apiFetch('/api/v1/reference-data/countries');
}

export async function fetchProvinces(countryId: string): Promise<Province[]> {
  return apiFetch('/api/v1/reference-data/provinces', { query: { country_id: countryId } });
}

export async function fetchCities(provinceId: string): Promise<City[]> {
  return apiFetch('/api/v1/reference-data/cities', { query: { province_id: provinceId } });
}

export async function fetchPhoneCodes(): Promise<PhoneCode[]> {
  return apiFetch('/api/v1/reference-data/phone-codes');
}

export async function fetchCurrencies(): Promise<Currency[]> {
  return apiFetch('/api/v1/reference-data/currencies');
}

export async function fetchUnits(): Promise<Unit[]> {
  return apiFetch('/api/v1/reference-data/units');
}

/**
 * The six tables above are small, structurally-similar lookup tables that all already got the
 * same generic `<table>_admin_write` RLS policy from one dynamic policy-generation loop
 * (Module 4/5's migration) — one generic set of write functions mirrors that, instead of 18
 * near-duplicate `createCountry`/`updateCountry`/`deleteCountry`/... functions.
 */
export type RefDataTable = 'countries' | 'provinces' | 'cities' | 'phone_codes' | 'currencies' | 'units';

/**
 * Unfiltered read of any of the six tables, for `ReferenceDataScreen`'s own list and for
 * populating a parent picker (e.g. every province, not just one country's) — the existing
 * `fetch*` functions above are scoped for picker consumption elsewhere and don't fit either use.
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
