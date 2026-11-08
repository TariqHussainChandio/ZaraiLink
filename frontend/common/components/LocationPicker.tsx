import React, { useMemo } from 'react';
import { View } from 'react-native';
import { COUNTRY, PROVINCES } from '../constants/locations';
import { SelectField, type SelectOption } from './SelectField';
import { TextField } from './TextField';

export interface LocationPickerProps {
  /** Not a field: the country is always Pakistan. Kept so existing forms compile; the picker reports it through
   * `onCountryChange` whenever the province or city changes, so a form that stores a country still stores it. */
  country?: string | null;
  province: string | null;
  city: string | null;
  onCountryChange?: (value: string | null) => void;
  onProvinceChange: (value: string | null) => void;
  onCityChange: (value: string | null) => void;
  /** `country` is accepted and ignored (there is no country field); it goes in Stage 2, once no form passes it. */
  labels?: { country?: string; province?: string; city?: string };
  /** One message per field, shown under it. */
  errors?: { province?: string; city?: string };
}

/** Province from the list, city as text. */
export function LocationPicker({
  province,
  city,
  onCountryChange,
  onProvinceChange,
  onCityChange,
  labels,
  errors,
}: LocationPickerProps) {
  const options = useMemo<SelectOption[]>(() => {
    const listed = PROVINCES.map(name => ({ id: name, label: name }));
    // A value saved before this list existed ("Sind") still shows, instead of reading as nothing chosen.
    return province && !PROVINCES.some(name => name === province) ? [{ id: province, label: province }, ...listed] : listed;
  }, [province]);

  return (
    <View>
      <SelectField
        label={labels?.province ?? 'Province'}
        placeholder="Choose a province"
        value={province}
        options={options}
        searchable={false}
        error={errors?.province}
        onSelect={id => {
          onCountryChange?.(COUNTRY);
          onProvinceChange(id);
        }}
      />
      <TextField
        label={labels?.city ?? 'City'}
        autoComplete="postal-address-locality"
        value={city ?? ''}
        error={errors?.city}
        onChangeText={text => {
          onCountryChange?.(COUNTRY);
          onCityChange(text || null);
        }}
      />
    </View>
  );
}
