import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ScrollView, View } from 'react-native';
import { z } from 'zod';
import { Banner, Button, ScreenState, SelectField, TextField, useToast } from '../../common/components';
import { useTheme } from '../../theme';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { optionalNumber, TEXT_LIMITS, toNumberOrNull } from '../components/formValues';
import { makeScreenStyles } from '../components/screenStyles';
import { inventoryErrorMessage } from '../hooks/errors';
import { useProduct, useRemoveProduct, useSaveProduct } from '../hooks/inventory';
import { INVENTORY_ROUTES, type InventoryScreenProps } from '../types/navigation';

const tooLong = (max: number) => `Use at most ${max} characters`;

const schema = z.object({
  name: z.string().trim().min(1, 'Enter the product name').max(TEXT_LIMITS.name, tooLong(TEXT_LIMITS.name)),
  sku: z.string().trim().min(1, 'Enter a SKU or code for this product').max(TEXT_LIMITS.name, tooLong(TEXT_LIMITS.name)),
  unit: z
    .string()
    .trim()
    .min(1, 'Enter the unit you count it in, such as bag or kg')
    .max(TEXT_LIMITS.unit, tooLong(TEXT_LIMITS.unit)),
  costPrice: optionalNumber,
  sellingPrice: optionalNumber,
  reorderThreshold: optionalNumber,
  status: z.enum(['active', 'inactive']),
});

type FormValues = z.infer<typeof schema>;

const STATUS_OPTIONS = [
  { id: 'active', label: 'Active' },
  { id: 'inactive', label: 'Inactive (hidden from operations)' },
];

/** Adds a product or edits one. Stock is never typed here: it changes only through Stock In and the other operations,
 * so every quantity has a ledger line (SRDS §22). The reorder threshold is the product's own low-stock level (§24). */
export function ProductFormScreen({ route, navigation }: InventoryScreenProps<typeof INVENTORY_ROUTES.ProductForm>) {
  const theme = useTheme();
  const styles = useMemo(() => makeScreenStyles(theme), [theme]);
  const productId = route.params?.productId;
  const result = useProduct(productId);
  const { data: product } = result;
  const save = useSaveProduct();
  const remove = useRemoveProduct();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', sku: '', unit: 'unit', costPrice: '', sellingPrice: '', reorderThreshold: '', status: 'active' },
  });

  // Filled once from the first copy; a background refetch must not overwrite what the dealer is typing.
  const filled = useRef(false);
  useEffect(() => {
    if (!product || filled.current) return;
    filled.current = true;
    reset({
      name: product.name,
      sku: product.sku,
      unit: product.unit,
      costPrice: product.cost_price != null ? String(product.cost_price) : '',
      sellingPrice: product.selling_price != null ? String(product.selling_price) : '',
      reorderThreshold: String(product.reorder_threshold),
      status: product.is_active ? 'active' : 'inactive',
    });
  }, [product, reset]);

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    const input = {
      name: values.name.trim(),
      sku: values.sku.trim(),
      unit: values.unit.trim(),
      cost_price: toNumberOrNull(values.costPrice),
      selling_price: toNumberOrNull(values.sellingPrice),
      reorder_threshold: toNumberOrNull(values.reorderThreshold) ?? 0,
      is_active: values.status === 'active',
    };
    try {
      const saved = productId ? await save.mutateAsync({ id: productId, input }) : await save.mutateAsync({ input });
      toast.success(productId ? 'Product saved' : 'Product added');
      if (productId) navigation.goBack();
      else navigation.replace(INVENTORY_ROUTES.ProductDetail, { productId: saved.id });
    } catch (err) {
      setFormError(inventoryErrorMessage(err));
    }
  };

  const onRemove = async () => {
    if (!productId) return;
    setFormError(null);
    try {
      await remove.mutateAsync(productId);
      setConfirmingRemove(false);
      toast.success('Product removed');
      navigation.popToTop();
    } catch (err) {
      setConfirmingRemove(false);
      setFormError(inventoryErrorMessage(err));
    }
  };

  if (productId && !product) {
    return (
      <View style={styles.screen}>
        <ScreenState query={result} errorTitle="Couldn't load this product" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Controller
        control={control}
        name="name"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField label="Product name" value={value} onChangeText={onChange} onBlur={onBlur} error={errors.name?.message} />
        )}
      />
      <Controller
        control={control}
        name="sku"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="SKU"
            helper="Your own code for this product; unique among your products."
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            autoCapitalize="characters"
            error={errors.sku?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="unit"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField label="Unit" value={value} onChangeText={onChange} onBlur={onBlur} error={errors.unit?.message} />
        )}
      />
      <Controller
        control={control}
        name="costPrice"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Cost price"
            optional
            prefix="Rs"
            numeric
            keyboardType="decimal-pad"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            helper="What one unit costs you; the dashboard values your stock with it."
            error={errors.costPrice?.message}
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
            prefix="Rs"
            numeric
            keyboardType="decimal-pad"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.sellingPrice?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="reorderThreshold"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Reorder threshold"
            optional
            numeric
            keyboardType="decimal-pad"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            helper="At or below this quantity the product shows as low stock."
            error={errors.reorderThreshold?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="status"
        render={({ field: { onChange, value } }) => (
          <SelectField label="Status" value={value} options={STATUS_OPTIONS} onSelect={onChange} searchable={false} />
        )}
      />
      {formError ? (
        <Banner tone="danger" title="Not saved">
          {formError}
        </Banner>
      ) : null}
      <Button label={productId ? 'Save changes' : 'Add product'} loading={save.isPending} onPress={handleSubmit(onSubmit)} />
      {productId ? (
        <Button label="Remove product" variant="danger" onPress={() => setConfirmingRemove(true)} />
      ) : null}
      <ConfirmSheet
        visible={confirmingRemove}
        title="Remove this product?"
        message="Its listings are unlinked. A product with stock history is kept as inactive so the ledger still adds up."
        confirmLabel="Remove product"
        destructive
        loading={remove.isPending}
        onConfirm={onRemove}
        onClose={() => setConfirmingRemove(false)}
      />
    </ScrollView>
  );
}
