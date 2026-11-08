import { zodResolver } from '@hookform/resolvers/zod';
import React, { useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { z } from 'zod';
import { Banner, Button, SelectField, Sheet, TextField, useSnackbar } from '../../common/components';
import { useUnits } from '../../common/reference-data';
import { useDealerListingOptions, useSaveInventoryItem } from '../hooks/dealer';
import { useAuthStore } from '../../state/authStore';
import { useTheme, type Theme } from '../../theme';
import type { InventoryItemWithListing } from '../types/dealer';
import { errorMessage } from '../../utils/errorMessage';
import { itemName } from './stock';

const WHOLE = /^\d+$/;
const MONEY = /^\d+(\.\d{1,2})?$/;
const NOT_LINKED = '';

const itemSchema = z.object({
  listingId: z.string(),
  unit: z.string().min(1, 'Choose a unit'),
  stockQuantity: z.string().trim().regex(WHOLE, 'Enter a whole number, like 20'),
  // Prices may be left empty; when given they are rupees with at most two decimals.
  purchaseCost: z.string().trim().refine(value => value === '' || MONEY.test(value), 'Enter an amount, like 9800'),
  sellingPrice: z.string().trim().refine(value => value === '' || MONEY.test(value), 'Enter an amount, like 9800'),
  minStockThreshold: z.string().trim().regex(WHOLE, 'Enter a whole number, like 5'),
});

type ItemFormValues = z.infer<typeof itemSchema>;

export interface StockItemSheetProps {
  /** Null adds a new item. */
  item: InventoryItemWithListing | null;
  onClose: () => void;
  /** The person chose "Remove item"; the screen closes this sheet and asks first. */
  onRemove: (item: InventoryItemWithListing) => void;
}

/** Adds a stock item or edits one. Units come from the admin's list; quantities are whole numbers and prices are rupees,
 * checked as the person types; a failure from the server shows inside the sheet and keeps what was typed. */
export function StockItemSheet({ item, onClose, onRemove }: StockItemSheetProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const snackbar = useSnackbar();
  const save = useSaveInventoryItem();
  const units = useUnits();
  const listings = useDealerListingOptions(!!userId);
  const [failure, setFailure] = useState<unknown>(null);

  const { control, handleSubmit, formState } = useForm<ItemFormValues>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      listingId: item?.listing_id ?? NOT_LINKED,
      unit: item?.unit ?? '',
      stockQuantity: item ? String(item.stock_quantity) : '0',
      purchaseCost: item?.purchase_cost != null ? String(item.purchase_cost) : '',
      sellingPrice: item?.selling_price != null ? String(item.selling_price) : '',
      minStockThreshold: item ? String(item.min_stock_threshold) : '0',
    },
  });
  const { errors } = formState;
  const unit = useWatch({ control, name: 'unit' });

  const unitOptions = useMemo(() => {
    const options = (units.data ?? []).map(row => ({ id: row.code, label: row.label }));
    // An item made before units were a list keeps its own word, so editing it never loses the unit.
    if (item && !options.some(option => option.id === item.unit)) options.unshift({ id: item.unit, label: item.unit });
    return options;
  }, [units.data, item]);

  const listingOptions = useMemo(
    () => [{ id: NOT_LINKED, label: 'Not linked to a listing' }, ...(listings.data ?? []).map(row => ({ id: row.id, label: row.title }))],
    [listings.data],
  );

  const unitWord = unitOptions.find(option => option.id === unit)?.label.toLowerCase() ?? 'unit';

  const onSubmit = async (values: ItemFormValues) => {
    setFailure(null);
    const input = {
      listingId: values.listingId === NOT_LINKED ? null : values.listingId,
      unit: values.unit,
      purchaseCost: values.purchaseCost === '' ? null : Number(values.purchaseCost),
      sellingPrice: values.sellingPrice === '' ? null : Number(values.sellingPrice),
      minStockThreshold: Number(values.minStockThreshold),
    };
    try {
      if (item) await save.mutateAsync({ id: item.id, input });
      else await save.mutateAsync({ input: { ...input, stockQuantity: Number(values.stockQuantity) } });
      snackbar.show(item ? 'Changes saved' : 'Item added');
      onClose();
    } catch (error) {
      setFailure(error);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title={item ? `Edit ${itemName(item)}` : 'Add stock item'}
      footer={
        <Button
          label={item ? 'Save changes' : 'Add item'}
          size="lg"
          loading={save.isPending}
          onPress={handleSubmit(onSubmit)}
        />
      }
    >
      <View style={styles.body}>
        {failure ? (
          <Banner tone="danger" title={item ? "Couldn't save the changes" : "Couldn't add the item"}>
            {errorMessage(failure)}
          </Banner>
        ) : null}

        <Controller
          control={control}
          name="listingId"
          render={({ field: { onChange, value } }) => (
            <SelectField
              label="Linked listing"
              value={value}
              options={listingOptions}
              onSelect={onChange}
              loading={listings.isPending && !listings.data}
            />
          )}
        />

        <Controller
          control={control}
          name="unit"
          render={({ field: { onChange, value } }) => (
            <SelectField
              label="Unit"
              placeholder="Select a unit"
              value={value || null}
              options={unitOptions}
              onSelect={onChange}
              loading={units.isPending && unitOptions.length === 0}
              searchable={false}
              error={errors.unit?.message ?? (units.isError && unitOptions.length === 0 ? errorMessage(units.error) : undefined)}
            />
          )}
        />

        {!item ? (
          <Controller
            control={control}
            name="stockQuantity"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Opening stock"
                numeric
                keyboardType="number-pad"
                suffix={unitWord}
                helper="Whole numbers only"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.stockQuantity?.message}
              />
            )}
          />
        ) : null}

        <Controller
          control={control}
          name="purchaseCost"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Buying price"
              optional
              numeric
              keyboardType="decimal-pad"
              prefix="Rs"
              suffix={`per ${unitWord}`}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.purchaseCost?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="sellingPrice"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Selling price"
              optional
              numeric
              keyboardType="decimal-pad"
              prefix="Rs"
              suffix={`per ${unitWord}`}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.sellingPrice?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="minStockThreshold"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Low-stock level"
              numeric
              keyboardType="number-pad"
              suffix={unitWord}
              helper="You are warned when stock falls to this or lower"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.minStockThreshold?.message}
            />
          )}
        />

        {item ? <Button label="Remove item" variant="dangerQuiet" onPress={() => onRemove(item)} /> : null}
      </View>
    </Sheet>
  );
}

function makeStyles({ space }: Theme) {
  return StyleSheet.create({
    body: { gap: space[1] },
  });
}
