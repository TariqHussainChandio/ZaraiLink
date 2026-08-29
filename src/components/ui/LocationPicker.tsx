import React, { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { useReferenceDataStore } from '../../store/referenceDataStore';
import { SelectField } from './SelectField';

export interface LocationPickerProps {
  countryId: string | null;
  provinceId: string | null;
  cityId: string | null;
  onCountryChange: (id: string | null) => void;
  onProvinceChange: (id: string | null) => void;
  onCityChange: (id: string | null) => void;
  labels?: { country?: string; province?: string; city?: string };
}

/** Cascading country → province → city picker backed by the reference-data store. Clearing a
 * parent selection clears its children so a stale province/city can never outlive its country. */
export function LocationPicker({
  countryId,
  provinceId,
  cityId,
  onCountryChange,
  onProvinceChange,
  onCityChange,
  labels,
}: LocationPickerProps) {
  const countries = useReferenceDataStore(state => state.countries);
  const provincesByCountry = useReferenceDataStore(state => state.provincesByCountry);
  const citiesByProvince = useReferenceDataStore(state => state.citiesByProvince);
  const loadCountries = useReferenceDataStore(state => state.loadCountries);
  const loadProvinces = useReferenceDataStore(state => state.loadProvinces);
  const loadCities = useReferenceDataStore(state => state.loadCities);

  useEffect(() => {
    loadCountries();
  }, [loadCountries]);

  useEffect(() => {
    if (countryId) loadProvinces(countryId);
  }, [countryId, loadProvinces]);

  useEffect(() => {
    if (provinceId) loadCities(provinceId);
  }, [provinceId, loadCities]);

  const provinceOptions = useMemo(
    () => (countryId ? (provincesByCountry[countryId] ?? []) : []),
    [countryId, provincesByCountry],
  );
  const cityOptions = useMemo(
    () => (provinceId ? (citiesByProvince[provinceId] ?? []) : []),
    [provinceId, citiesByProvince],
  );

  return (
    <View>
      <SelectField
        label={labels?.country ?? 'Country'}
        value={countryId}
        options={countries.map(c => ({ id: c.id, label: c.name }))}
        onSelect={id => {
          onCountryChange(id);
          onProvinceChange(null);
          onCityChange(null);
        }}
      />
      <SelectField
        label={labels?.province ?? 'Province'}
        value={provinceId}
        options={provinceOptions.map(p => ({ id: p.id, label: p.name }))}
        disabled={!countryId}
        onSelect={id => {
          onProvinceChange(id);
          onCityChange(null);
        }}
      />
      <SelectField
        label={labels?.city ?? 'City'}
        value={cityId}
        options={cityOptions.map(c => ({ id: c.id, label: c.name }))}
        disabled={!provinceId}
        onSelect={onCityChange}
      />
    </View>
  );
}
