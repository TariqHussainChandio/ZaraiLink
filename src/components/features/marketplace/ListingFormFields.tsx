import React, { useMemo } from 'react';
import { Controller, type Control, type FieldErrors, type UseFormSetValue, type UseFormWatch } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';
import { Input, LocationPicker } from '../../../components/ui';
import { useCategories, useCrops } from '../../../hooks/api/marketplace';
import { useTheme, type Theme } from '../../../theme';
import { CategoryChip } from './CategoryChip';

export const listingSchema = z.object({
  title: z.string().min(2, 'Enter a title'),
  description: z.string().optional(),
  categoryId: z.string().nullable(),
  price: z.coerce.number().positive('Enter a valid price'),
  unit: z.string().min(1, 'Enter a unit (e.g. kg, crate)'),
  quantity: z.coerce.number().positive('Enter a valid quantity'),
  brand: z.string(),
  condition: z.string(),
  cropCompatibility: z.array(z.string()),
  country: z.string().nullable(),
  province: z.string().nullable(),
  city: z.string().nullable(),
});

// z.coerce.number() has a different input type (unknown, pre-coercion) than output type
// (number, post-coercion) — react-hook-form's useForm<TFieldValues, TContext, TTransformedValues>
// needs both: the form/Controller layer works in the input shape, handleSubmit's callback
// receives the coerced output shape.
export type ListingFormInput = z.input<typeof listingSchema>;
export type ListingFormValues = z.output<typeof listingSchema>;

export const listingFormDefaults: ListingFormInput = {
  title: '',
  description: '',
  categoryId: null,
  price: 0,
  unit: 'kg',
  quantity: 0,
  brand: '',
  condition: '',
  cropCompatibility: [],
  country: null,
  province: null,
  city: null,
};

export interface ListingFormFieldsProps {
  control: Control<ListingFormInput>;
  errors: FieldErrors<ListingFormInput>;
  setValue: UseFormSetValue<ListingFormInput>;
  watch: UseFormWatch<ListingFormInput>;
}

/** The data-entry fields shared by CreateListingScreen and EditListingScreen. Photos are
 * handled by each screen separately since their image state (single list vs. existing +
 * newly-picked) differs. */
export function ListingFormFields({ control, errors, setValue, watch }: ListingFormFieldsProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { data: categories = [] } = useCategories();
  const { data: crops = [] } = useCrops();

  const country = watch('country');
  const province = watch('province');
  const city = watch('city');
  const cropCompatibility = watch('cropCompatibility');

  return (
    <>
      <Controller
        control={control}
        name="title"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            label="Title"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.title?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="description"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            label="Description"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            multiline
            numberOfLines={4}
          />
        )}
      />

      <Text style={styles.label}>Category</Text>
      <Controller
        control={control}
        name="categoryId"
        render={({ field: { onChange, value } }) => (
          <View style={styles.chipRow}>
            {categories.map(category => (
              <CategoryChip
                key={category.id}
                label={category.name}
                selected={value === category.id}
                onPress={() => onChange(value === category.id ? null : category.id)}
              />
            ))}
          </View>
        )}
      />

      <View style={styles.row}>
        <View style={styles.rowItem}>
          <Controller
            control={control}
            name="price"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Price"
                keyboardType="numeric"
                value={String(value)}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.price?.message}
              />
            )}
          />
        </View>
        <View style={styles.rowItem}>
          <Controller
            control={control}
            name="unit"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Unit"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.unit?.message}
              />
            )}
          />
        </View>
      </View>

      <Controller
        control={control}
        name="quantity"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            label="Quantity available"
            keyboardType="numeric"
            value={String(value)}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.quantity?.message}
          />
        )}
      />

      <View style={styles.row}>
        <View style={styles.rowItem}>
          <Controller
            control={control}
            name="brand"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Brand (optional)"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
              />
            )}
          />
        </View>
        <View style={styles.rowItem}>
          <Controller
            control={control}
            name="condition"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Condition (optional)"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
              />
            )}
          />
        </View>
      </View>

      {crops.length > 0 ? (
        <>
          <Text style={styles.label}>Crop compatibility</Text>
          <View style={styles.chipRow}>
            {crops.map(crop => {
              const selected = cropCompatibility.includes(crop.name);
              return (
                <CategoryChip
                  key={crop.id}
                  label={crop.name}
                  selected={selected}
                  onPress={() =>
                    setValue(
                      'cropCompatibility',
                      selected
                        ? cropCompatibility.filter(name => name !== crop.name)
                        : [...cropCompatibility, crop.name],
                    )
                  }
                />
              );
            })}
          </View>
        </>
      ) : null}

      <Text style={styles.label}>Location (optional)</Text>
      <LocationPicker
        country={country}
        province={province}
        city={city}
        onCountryChange={value => setValue('country', value)}
        onProvinceChange={value => setValue('province', value)}
        onCityChange={value => setValue('city', value)}
      />
    </>
  );
}

function makeStyles({ colors, spacing, typography }: Theme) {
  return StyleSheet.create({
    label: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.medium,
      color: colors.text.secondary,
      marginBottom: spacing.xs,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginBottom: spacing.md,
    },
    row: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    rowItem: {
      flex: 1,
    },
  });
}
