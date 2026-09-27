import React from 'react';
import { View } from 'react-native';
import { Input } from './Input';

export interface LocationPickerProps {
  country: string | null;
  province: string | null;
  city: string | null;
  onCountryChange: (value: string | null) => void;
  onProvinceChange: (value: string | null) => void;
  onCityChange: (value: string | null) => void;
  labels?: { country?: string; province?: string; city?: string };
}

/** Free-text country / province / city fields. */
export function LocationPicker({
  country,
  province,
  city,
  onCountryChange,
  onProvinceChange,
  onCityChange,
  labels,
}: LocationPickerProps) {
  return (
    <View>
      <Input
        label={labels?.country ?? 'Country'}
        value={country ?? ''}
        onChangeText={text => onCountryChange(text || null)}
      />
      <Input
        label={labels?.province ?? 'Province'}
        value={province ?? ''}
        onChangeText={text => onProvinceChange(text || null)}
      />
      <Input
        label={labels?.city ?? 'City'}
        value={city ?? ''}
        onChangeText={text => onCityChange(text || null)}
      />
    </View>
  );
}
