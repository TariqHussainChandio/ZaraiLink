import React, { useMemo } from 'react';
import { Controller, type Control, type FieldErrors, type UseFormSetValue, type UseFormWatch } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';
import { Chip, LocationPicker, SelectField, TextField, type SelectOption } from '../../components';
import { useUnits } from '../../reference-data';
import { useCategories, useCrops } from '../hooks/marketplace';
import { useTheme, type Theme } from '../../../theme';
import { digitsOnly } from '../utils/digits';

/** A whole number above zero typed into a text box. Only the digits count, so "1,500" is 1500 and never 0 (MK-04). */
const positiveWhole = (message: string) =>
  z
    .string()
    .transform(text => Number(digitsOnly(text) || 0))
    .refine(value => value > 0, message);

export const listingSchema = z.object({
  title: z.string().trim().min(2, 'Enter a name of at least 2 letters'),
  description: z.string().optional(),
  categoryId: z.string().nullable(),
  price: positiveWhole('Enter the price in rupees, above Rs 0'),
  unit: z.string().min(1, 'Choose how it is sold, such as kg or bag'),
  quantity: positiveWhole('Enter how many you have, 1 or more'),
  brand: z.string(),
  condition: z.string(),
  cropCompatibility: z.array(z.string()),
  country: z.string().nullable(),
  province: z.string().nullable(),
  city: z.string().nullable(),
});

// The price and quantity boxes hold text (digits), the submitted values are numbers: react-hook-form's useForm needs the
// input shape for the fields and the output shape for what handleSubmit hands over.
export type ListingFormInput = z.input<typeof listingSchema>;
export type ListingFormValues = z.output<typeof listingSchema>;

/** Price and quantity start empty, not as a visible "0" the seller must type after (MK-09). */
export const listingFormDefaults: ListingFormInput = {
  title: '',
  description: '',
  categoryId: null,
  price: '',
  unit: '',
  quantity: '',
  brand: '',
  condition: '',
  cropCompatibility: [],
  country: null,
  province: null,
  city: null,
};

export interface ListingFormFieldsProps {
  control: Control<ListingFormInput, any, ListingFormValues>;
  errors: FieldErrors<ListingFormInput>;
  setValue: UseFormSetValue<ListingFormInput>;
  watch: UseFormWatch<ListingFormInput>;
}

/** The data-entry fields shared by CreateListingScreen and EditListingScreen: what is sold, how it is priced, where it is,
 * and the optional details. Photos are the screens' own (new photos and saved ones differ). */
export function ListingFormFields({ control, errors, setValue, watch }: ListingFormFieldsProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { data: categories = [] } = useCategories();
  const { data: crops = [] } = useCrops();
  const { data: units = [], isPending: unitsLoading } = useUnits();

  const country = watch('country');
  const province = watch('province');
  const city = watch('city');
  const unit = watch('unit');
  const cropCompatibility = watch('cropCompatibility');

  const categoryOptions = useMemo<SelectOption[]>(() => categories.map(category => ({ id: category.id, label: category.name })), [categories]);
  // A listing is sold by weight, volume or count, never by area. A unit saved before this list existed ("40kg bag") still
  // shows, instead of reading as nothing chosen.
  const unitOptions = useMemo<SelectOption[]>(() => {
    const listed = units.filter(u => u.applies_to !== 'area').map(u => ({ id: u.code, label: `${u.label} (${u.code})` }));
    return unit && !listed.some(option => option.id === unit) ? [{ id: unit, label: unit }, ...listed] : listed;
  }, [units, unit]);
  const per = unit || 'unit';

  return (
    <View style={styles.form}>
      <Controller
        control={control}
        name="title"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField label="Name of the product" value={value} onChangeText={onChange} onBlur={onBlur} error={errors.title?.message} />
        )}
      />

      <Controller
        control={control}
        name="categoryId"
        render={({ field: { onChange, value } }) => (
          <SelectField label="Category" placeholder="Choose a category" value={value} options={categoryOptions} onSelect={onChange} searchable={false} />
        )}
      />

      <Controller
        control={control}
        name="unit"
        render={({ field: { onChange, value } }) => (
          <SelectField
            label="Sold by"
            placeholder="Choose a unit"
            value={value || null}
            options={unitOptions}
            onSelect={onChange}
            loading={unitsLoading}
            error={errors.unit?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="price"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Price"
            prefix="Rs"
            suffix={`per ${per}`}
            numeric
            keyboardType="number-pad"
            value={value}
            onChangeText={text => onChange(digitsOnly(text))}
            onBlur={onBlur}
            error={errors.price?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="quantity"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Quantity available"
            suffix={per}
            numeric
            keyboardType="number-pad"
            value={value}
            onChangeText={text => onChange(digitsOnly(text))}
            onBlur={onBlur}
            error={errors.quantity?.message}
          />
        )}
      />

      <LocationPicker
        country={country}
        province={province}
        city={city}
        labels={{ province: 'Province', city: 'City' }}
        onCountryChange={value => setValue('country', value)}
        onProvinceChange={value => setValue('province', value)}
        onCityChange={value => setValue('city', value)}
      />

      <Text style={styles.heading} accessibilityRole="header">
        More details
      </Text>

      <Controller
        control={control}
        name="description"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField label="Description" optional value={value} onChangeText={onChange} onBlur={onBlur} multiline numberOfLines={4} textAlignVertical="top" />
        )}
      />

      <View style={styles.row}>
        <View style={styles.rowItem}>
          <Controller
            control={control}
            name="brand"
            render={({ field: { onChange, onBlur, value } }) => <TextField label="Brand" optional value={value} onChangeText={onChange} onBlur={onBlur} />}
          />
        </View>
        <View style={styles.rowItem}>
          <Controller
            control={control}
            name="condition"
            render={({ field: { onChange, onBlur, value } }) => <TextField label="Condition" optional value={value} onChangeText={onChange} onBlur={onBlur} />}
          />
        </View>
      </View>

      {crops.length > 0 ? (
        <View style={styles.group}>
          <Text style={styles.label}>Suits these crops</Text>
          <View style={styles.chips}>
            {crops.map(crop => {
              const selected = cropCompatibility.includes(crop.name);
              return (
                <Chip
                  key={crop.id}
                  label={crop.name}
                  selected={selected}
                  onPress={() =>
                    setValue('cropCompatibility', selected ? cropCompatibility.filter(name => name !== crop.name) : [...cropCompatibility, crop.name])
                  }
                />
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    form: { gap: 0 },
    heading: { ...typography.title, color: colors.ink, marginBottom: space[3] },
    group: { gap: space[2], marginBottom: space[4] },
    label: { ...typography.label, color: colors.ink },
    // Wrapped with a gap, so the chips neither touch nor share a touch area (MK-17).
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
    row: { flexDirection: 'row', gap: space[3] },
    rowItem: { flex: 1 },
  });
}
