// Shared form fields for creating and editing a listing.
import React, { useMemo } from 'react';
import {
  Controller,
  type Control,
  type FieldErrors,
  type UseFormSetValue,
  type UseFormWatch,
} from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';
import { LocationPicker, SelectField, TextField, type SelectOption } from '../../components';
import { useUnits } from '../../reference-data';
import { useCategories, useLinkableInventoryProducts } from '../hooks/marketplace';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';
import { digitsOnly } from '../utils/digits';

/** A whole number above zero typed into a text box. Only the digits count, so "1,500" is 1500 and never 0 (MK-04). */
const positiveWhole = (message: string) =>
  z
    .string()
    .transform(text => Number(digitsOnly(text) || 0))
    .refine(value => value > 0, message);

/** A whole number of zero or more (D20: a quantity of 0 lists the product as out of stock); the box must not be empty. */
const wholeOrZero = (message: string) =>
  z
    .string()
    .refine(text => digitsOnly(text) !== '', message)
    .transform(text => Number(digitsOnly(text)));

// Validation rules for the listing form.
export const listingSchema = z.object({
  title: z.string().trim().min(2, 'Enter a name of at least 2 letters'),
  description: z.string().optional(),
  categoryId: z.string().nullable(),
  price: positiveWhole('Enter the price in rupees, above Rs 0'),
  unit: z.string().min(1, 'Choose how it is sold, such as kg or bag'),
  // 0 is allowed: the listing then shows as out of stock (listing_availability, 20261022090000_inventory_sync.sql).
  quantity: wholeOrZero('Enter how many you have; 0 shows it as out of stock'),
  brand: z.string(),
  condition: z.string(),
  // D20: the form no longer asks which crops a product suits. The field stays so an edit keeps what an older listing
  // saved, and a new listing sends none.
  cropCompatibility: z.array(z.string()),
  country: z.string().nullable(),
  province: z.string().nullable(),
  city: z.string().nullable(),
  /** D8: an approved dealer's linked inventory product; null when unlinked (and always for everyone else). */
  inventoryProductId: z.string().nullable(),
});

// The price and quantity boxes hold text (digits), the submitted values are numbers: react-hook-form's useForm needs the
// input shape for the fields and the output shape for what handleSubmit hands over.
export type ListingFormInput = z.input<typeof listingSchema>;
// The form values after validation.
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
  inventoryProductId: null,
};

/** The picker's "no product" choice; SelectField needs a string id for it. */
const NO_PRODUCT = 'none';

// Props for ListingFormFields.
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
  const { data: units = [], isPending: unitsLoading } = useUnits();
  // Only an approved dealer has an inventory to link (BR-03/04, D8); the API refuses anyone else, so nobody else asks.
  const canLinkProduct = useAuthStore(
    state => state.profile?.role === 'dealer' && state.profile.account_status === 'approved',
  );
  const products = useLinkableInventoryProducts(canLinkProduct);
  // The dealer's inventory products to link, starting with "None".
  const productOptions = useMemo<SelectOption[]>(
    () => [
      { id: NO_PRODUCT, label: 'None' },
      ...(products.data ?? [])
        .filter(product => product.is_active)
        .map(product => ({ id: product.id, label: `${product.name} · ${product.sku}` })),
    ],
    [products.data],
  );

  const country = watch('country');
  const province = watch('province');
  const city = watch('city');
  const unit = watch('unit');

  // The category choices for the picker.
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

      {canLinkProduct ? (
        <Controller
          control={control}
          name="inventoryProductId"
          render={({ field: { onChange, value } }) => (
            <View style={styles.group}>
              <SelectField
                label="Linked inventory product"
                // Shown when the linked product is not among the choices: inactive, or the list did not load.
                placeholder={products.isError ? 'Linked product' : 'A product no longer active'}
                value={value ?? NO_PRODUCT}
                options={productOptions}
                onSelect={id => onChange(id === NO_PRODUCT ? null : id)}
                loading={products.isPending}
                error={products.isError ? 'Your inventory products could not be loaded.' : undefined}
              />
              <Text style={styles.helper}>Optional. Stock for this listing then comes from your inventory.</Text>
            </View>
          )}
        />
      ) : null}
    </View>
  );
}

// Builds the styles from the theme.
function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    form: { gap: 0 },
    heading: { ...typography.title, color: colors.ink, marginBottom: space[3] },
    group: { gap: space[2], marginBottom: space[4] },
    row: { flexDirection: 'row', gap: space[3] },
    rowItem: { flex: 1 },
    helper: { ...typography.caption, color: colors.ink2 },
  });
}
