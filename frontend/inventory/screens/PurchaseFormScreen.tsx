import { zodResolver } from '@hookform/resolvers/zod';
import { Lock, Plus, Trash2 } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { ScrollView, Text, View } from 'react-native';
import { z } from 'zod';
import {
  Banner,
  Button,
  Card,
  EmptyState,
  ScreenState,
  SelectField,
  TextField,
  useToast,
} from '../../common/components';
import { useTheme } from '../../theme';
import {
  cappedText,
  optionalNumber,
  positiveNumber,
  TEXT_LIMITS,
  toNumberOrNull,
  toTextOrNull,
} from '../components/formValues';
import { makeScreenStyles } from '../components/screenStyles';
import { Section } from '../components/Section';
import { useEntryKey } from '../hooks/entryKey';
import {
  inventoryErrorMessage,
  writeErrorMessage,
  writeErrorTitle,
} from '../hooks/errors';
import {
  useProducts,
  usePurchase,
  useSavePurchase,
  useSuppliers,
} from '../hooks/inventory';
import { useSelectedLocation } from '../hooks/location';
import {
  INVENTORY_ROUTES,
  type InventoryScreenProps,
} from '../types/navigation';

const NO_SUPPLIER = 'none';

const lineSchema = z.object({
  productId: z.string().min(1, 'Choose a product'),
  locationId: z.string().min(1, 'Choose where it goes'),
  quantity: positiveNumber,
  unitCost: optionalNumber,
});

const schema = z.object({
  supplierId: z.string(),
  reference: cappedText(TEXT_LIMITS.reference),
  notes: cappedText(TEXT_LIMITS.text),
  lines: z.array(lineSchema).min(1, 'Add at least one line'),
});

type FormValues = z.infer<typeof schema>;

/** A new purchase saved as a draft, or an edit of a draft: nothing reaches stock until it is received
 * (receive_purchase, one transaction). Saving an edit replaces every line (replace_purchase_items). */
export function PurchaseFormScreen({
  route,
  navigation,
}: InventoryScreenProps<typeof INVENTORY_ROUTES.PurchaseForm>) {
  const theme = useTheme();
  const styles = useMemo(() => makeScreenStyles(theme), [theme]);
  const purchaseId = route.params?.purchaseId;
  const existing = usePurchase(purchaseId);
  const suppliers = useSuppliers();
  const products = useProducts();
  const { location, locations } = useSelectedLocation();
  const save = useSavePurchase();
  // A new purchase is sent with one key for this entry, kept until a confirmed save (F2).
  const { key, renew } = useEntryKey();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);

  const emptyLine = {
    productId: '',
    locationId: location?.id ?? '',
    quantity: '',
    unitCost: '',
  };
  const {
    control,
    handleSubmit,
    reset,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      supplierId: NO_SUPPLIER,
      reference: '',
      notes: '',
      lines: [emptyLine],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });

  // The locations load after the form when the cache is cold: a new line that has no location yet starts from the app
  // bar's once it is known (without this the first line asked "Choose where it goes" on a fresh start).
  useEffect(() => {
    if (!location || purchaseId) return;
    getValues('lines').forEach((line, index) => {
      if (!line.locationId) setValue(`lines.${index}.locationId`, location.id);
    });
  }, [location, purchaseId, getValues, setValue]);

  // An edit starts from the draft's first copy; a background refetch must not overwrite what the dealer is typing.
  const filled = useRef(false);
  const purchase = existing.data;
  useEffect(() => {
    if (!purchase || filled.current) return;
    filled.current = true;
    reset({
      supplierId: purchase.supplier_id ?? NO_SUPPLIER,
      reference: purchase.reference ?? '',
      notes: purchase.notes ?? '',
      lines: (purchase.items ?? []).map(item => ({
        productId: item.product_id,
        locationId: item.location_id,
        quantity: String(item.quantity),
        unitCost: item.unit_cost != null ? String(item.unit_cost) : '',
      })),
    });
  }, [purchase, reset]);

  const supplierOptions = useMemo(
    () => [
      { id: NO_SUPPLIER, label: 'No supplier' },
      ...(suppliers.data ?? [])
        .filter(item => item.is_active)
        .map(item => ({ id: item.id, label: item.name })),
    ],
    [suppliers.data],
  );
  const productOptions = useMemo(
    () =>
      (products.data ?? [])
        .filter(item => item.is_active)
        .map(item => ({ id: item.id, label: `${item.name} (${item.sku})` })),
    [products.data],
  );
  const locationOptions = useMemo(
    () => locations.map(item => ({ id: item.id, label: item.name })),
    [locations],
  );

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    const input = {
      supplier_id: values.supplierId === NO_SUPPLIER ? null : values.supplierId,
      reference: toTextOrNull(values.reference),
      notes: toTextOrNull(values.notes),
      items: values.lines.map(line => ({
        product_id: line.productId,
        location_id: line.locationId,
        quantity: Number(line.quantity),
        unit_cost: toNumberOrNull(line.unitCost),
      })),
    };
    try {
      if (purchaseId) {
        await save.mutateAsync({ id: purchaseId, input });
        toast.success('Purchase saved');
        navigation.goBack();
      } else {
        const created = await save.mutateAsync({ input, key });
        renew();
        toast.success('Purchase saved as a draft');
        navigation.replace(INVENTORY_ROUTES.PurchaseDetail, {
          purchaseId: created.id,
        });
      }
    } catch (err) {
      setFormError(
        purchaseId ? inventoryErrorMessage(err) : writeErrorMessage(err),
      );
    }
  };

  if (purchaseId && !purchase) {
    return (
      <View style={styles.screen}>
        <ScreenState
          query={existing}
          errorTitle="Couldn't load this purchase"
        />
      </View>
    );
  }

  // Received or cancelled since the dealer opened it: the server would refuse the edit (409), so the form is not shown.
  if (purchase && purchase.status !== 'draft') {
    return (
      <View style={styles.screen}>
        <EmptyState
          icon={Lock}
          title={
            purchase.status === 'received'
              ? 'This purchase is received'
              : 'This purchase is cancelled'
          }
          description="Only a draft can be edited. Record a new purchase or a stock adjustment instead."
          actionLabel="Back"
          onAction={() => navigation.goBack()}
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Controller
        control={control}
        name="supplierId"
        render={({ field: { onChange, value } }) => (
          <SelectField
            label="Supplier"
            value={value}
            options={supplierOptions}
            onSelect={onChange}
            loading={suppliers.isPending}
          />
        )}
      />
      <Controller
        control={control}
        name="reference"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Reference"
            optional
            helper="The supplier's bill or invoice number."
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.reference?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="notes"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Notes"
            optional
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            multiline
            error={errors.notes?.message}
          />
        )}
      />

      <Section title="Lines">
        {fields.map((field, index) => (
          <Card key={field.id} style={styles.actions}>
            <View style={styles.row}>
              <Text
                style={[styles.overline, styles.grow]}
              >{`Line ${index + 1}`}</Text>
              {fields.length > 1 ? (
                <Button
                  label={`Remove line ${index + 1}`}
                  variant="quiet"
                  size="sm"
                  icon={Trash2}
                  onPress={() => remove(index)}
                />
              ) : null}
            </View>
            <Controller
              control={control}
              name={`lines.${index}.productId`}
              render={({ field: { onChange, value } }) => (
                <SelectField
                  label="Product"
                  placeholder="Choose a product"
                  value={value || null}
                  options={productOptions}
                  onSelect={onChange}
                  loading={products.isPending}
                  error={errors.lines?.[index]?.productId?.message}
                />
              )}
            />
            <Controller
              control={control}
              name={`lines.${index}.locationId`}
              render={({ field: { onChange, value } }) => (
                <SelectField
                  label="Receive into"
                  value={value || null}
                  options={locationOptions}
                  onSelect={onChange}
                  searchable={false}
                  error={errors.lines?.[index]?.locationId?.message}
                />
              )}
            />
            <Controller
              control={control}
              name={`lines.${index}.quantity`}
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  label="Quantity"
                  numeric
                  keyboardType="decimal-pad"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.lines?.[index]?.quantity?.message}
                />
              )}
            />
            <Controller
              control={control}
              name={`lines.${index}.unitCost`}
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  label="Unit cost"
                  optional
                  prefix="Rs"
                  numeric
                  keyboardType="decimal-pad"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.lines?.[index]?.unitCost?.message}
                />
              )}
            />
          </Card>
        ))}
        {errors.lines?.message ? (
          <Text style={styles.caption}>{errors.lines.message}</Text>
        ) : null}
        <Button
          label="Add line"
          variant="secondary"
          icon={Plus}
          onPress={() => append(emptyLine)}
        />
      </Section>

      {formError ? (
        <Banner tone="danger" title={writeErrorTitle(formError)}>
          {formError}
        </Banner>
      ) : null}
      <Button
        label={purchaseId ? 'Save changes' : 'Save draft'}
        loading={save.isPending}
        onPress={handleSubmit(onSubmit)}
      />
    </ScrollView>
  );
}
