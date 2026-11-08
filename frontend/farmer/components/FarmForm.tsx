import { zodResolver } from '@hookform/resolvers/zod';
import React, { useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, LocationPicker, ScreenScaffold, StickyActionBar, TextField } from '../../common/components';
import { COUNTRY } from '../../common/constants/locations';
import { useUnits } from '../../common/reference-data';
import { isValidArea, parseArea } from '../constants/forms';
import type { Farm } from '../types/farmer';
import { ChoiceField } from './ChoiceField';

const farmSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter a farm name'),
    area: z.string().refine(isValidArea, 'Enter the area as a number, for example 2.5'),
    landUnit: z.string(),
    notes: z.string(),
    province: z.string().nullable(),
    city: z.string().nullable(),
  })
  .refine(values => values.area.trim() === '' || values.landUnit !== '', { path: ['landUnit'], message: 'Choose the unit of the area' });

export type FarmFormValues = z.infer<typeof farmSchema>;

const EMPTY_FARM: FarmFormValues = { name: '', area: '', landUnit: '', notes: '', province: null, city: null };

export function farmToFormValues(farm: Farm): FarmFormValues {
  return {
    name: farm.name,
    area: farm.area !== null ? String(farm.area) : '',
    landUnit: farm.land_unit ?? '',
    notes: farm.notes ?? '',
    province: farm.location?.province ?? null,
    city: farm.location?.city ?? null,
  };
}

/** The request body for a saved form. The country is always Pakistan (the picker has no country field) and is stored
 * whenever a place is given. */
export function farmInputFromValues(values: FarmFormValues) {
  const hasPlace = values.province !== null || values.city !== null;
  return {
    name: values.name.trim(),
    area: parseArea(values.area),
    landUnit: values.landUnit || null,
    notes: values.notes.trim() || null,
    country: hasPlace ? COUNTRY : null,
    province: values.province,
    city: values.city,
  };
}

interface FarmFormProps {
  initial?: FarmFormValues;
  submitLabel: string;
  submitting: boolean;
  onSubmit: (values: FarmFormValues) => Promise<unknown> | void;
  /** Below the fields: Cancel, or a destructive entry point that opens a confirm sheet. */
  extra?: React.ReactNode;
}

/** The farm's fields, for adding a farm and for editing one (FA-22): a province to choose, an area typed as a number with
 * its unit as chips, and the optional ones marked. The Save button is pinned above the keyboard (FA-13). */
export function FarmForm({ initial = EMPTY_FARM, submitLabel, submitting, onSubmit, extra }: FarmFormProps) {
  const { data: units = [] } = useUnits();
  const unitOptions = useMemo(() => units.filter(u => u.applies_to === 'area').map(u => ({ value: u.code, label: u.label })), [units]);
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FarmFormValues>({ resolver: zodResolver(farmSchema), defaultValues: initial });

  return (
    <ScreenScaffold
      footer={
        <StickyActionBar>
          <Button label={submitLabel} size="lg" loading={submitting} onPress={handleSubmit(onSubmit)} />
        </StickyActionBar>
      }
    >
      <Controller
        control={control}
        name="name"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField label="Farm name" value={value} onChangeText={onChange} onBlur={onBlur} error={errors.name?.message} />
        )}
      />

      <Controller
        control={control}
        name="province"
        render={({ field: province }) => (
          <Controller
            control={control}
            name="city"
            render={({ field: city }) => (
              <LocationPicker
                province={province.value}
                city={city.value}
                onProvinceChange={province.onChange}
                onCityChange={city.onChange}
              />
            )}
          />
        )}
      />

      <Controller
        control={control}
        name="area"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Area"
            optional
            numeric
            keyboardType="decimal-pad"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.area?.message}
          />
        )}
      />

      {unitOptions.length > 0 ? (
        <Controller
          control={control}
          name="landUnit"
          render={({ field: { onChange, value } }) => (
            <ChoiceField
              label="Unit of area"
              options={unitOptions}
              value={value}
              onChange={onChange}
              helper="Needed when you enter an area"
              error={errors.landUnit?.message}
            />
          )}
        />
      ) : null}

      <Controller
        control={control}
        name="notes"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField label="Notes" optional value={value} onChangeText={onChange} onBlur={onBlur} multiline numberOfLines={3} />
        )}
      />

      {extra}
    </ScreenScaffold>
  );
}
