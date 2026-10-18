import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ScrollView, View } from 'react-native';
import { z } from 'zod';
import { Banner, Button, ScreenState, SelectField, TextField, useToast } from '../../common/components';
import { useTheme } from '../../theme';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { cappedText, TEXT_LIMITS, toTextOrNull } from '../components/formValues';
import { makeScreenStyles } from '../components/screenStyles';
import { inventoryErrorMessage } from '../hooks/errors';
import { useRemoveSupplier, useSaveSupplier, useSuppliers } from '../hooks/inventory';
import type { INVENTORY_ROUTES, InventoryScreenProps } from '../types/navigation';

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Enter the supplier’s name')
    .max(TEXT_LIMITS.name, `Use at most ${TEXT_LIMITS.name} characters`),
  contact: cappedText(TEXT_LIMITS.contact),
  productsSupplied: cappedText(TEXT_LIMITS.text),
  notes: cappedText(TEXT_LIMITS.text),
  status: z.enum(['active', 'inactive']),
});

type FormValues = z.infer<typeof schema>;

const STATUS_OPTIONS = [
  { id: 'active', label: 'Active' },
  { id: 'inactive', label: 'Inactive' },
];

/** Adds a supplier or edits one. */
export function SupplierFormScreen({ route, navigation }: InventoryScreenProps<typeof INVENTORY_ROUTES.SupplierForm>) {
  const theme = useTheme();
  const styles = useMemo(() => makeScreenStyles(theme), [theme]);
  const supplierId = route.params?.supplierId;
  const suppliers = useSuppliers();
  const supplier = supplierId ? suppliers.data?.find(item => item.id === supplierId) : undefined;
  const save = useSaveSupplier();
  const remove = useRemoveSupplier();
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
    defaultValues: { name: '', contact: '', productsSupplied: '', notes: '', status: 'active' },
  });

  const filled = useRef(false);
  useEffect(() => {
    if (!supplier || filled.current) return;
    filled.current = true;
    reset({
      name: supplier.name,
      contact: supplier.contact ?? '',
      productsSupplied: supplier.products_supplied ?? '',
      notes: supplier.notes ?? '',
      status: supplier.is_active ? 'active' : 'inactive',
    });
  }, [supplier, reset]);

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    const input = {
      name: values.name.trim(),
      contact: toTextOrNull(values.contact),
      products_supplied: toTextOrNull(values.productsSupplied),
      notes: toTextOrNull(values.notes),
      is_active: values.status === 'active',
    };
    try {
      if (supplierId) await save.mutateAsync({ id: supplierId, input });
      else await save.mutateAsync({ input });
      toast.success('Supplier saved');
      navigation.goBack();
    } catch (err) {
      setFormError(inventoryErrorMessage(err));
    }
  };

  const onRemove = async () => {
    if (!supplierId) return;
    setFormError(null);
    try {
      await remove.mutateAsync(supplierId);
      setConfirmingRemove(false);
      toast.success('Supplier removed');
      navigation.goBack();
    } catch (err) {
      setConfirmingRemove(false);
      setFormError(inventoryErrorMessage(err));
    }
  };

  if (supplierId && !supplier) {
    return (
      <View style={styles.screen}>
        {/* The record comes from the list: the list read failing is an error; a list that loaded without it means
            "not found". */}
        <ScreenState
          query={{ ...suppliers, data: supplier }}
          errorTitle="Couldn't load this supplier"
          empty={{ title: 'Supplier not found', description: 'It may have been removed. Go back to the list.' }}
        />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Controller
        control={control}
        name="name"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Supplier name"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.name?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="contact"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Contact"
            optional
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            keyboardType="phone-pad"
            error={errors.contact?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="productsSupplied"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Products supplied"
            optional
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            multiline
            error={errors.productsSupplied?.message}
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
      <Button label={supplierId ? 'Save changes' : 'Add supplier'} loading={save.isPending} onPress={handleSubmit(onSubmit)} />
      {supplierId ? (
        <Button label="Remove supplier" variant="danger" onPress={() => setConfirmingRemove(true)} />
      ) : null}
      <ConfirmSheet
        visible={confirmingRemove}
        title="Remove this supplier?"
        message="A supplier with recorded purchases is kept as inactive."
        confirmLabel="Remove supplier"
        destructive
        loading={remove.isPending}
        onConfirm={onRemove}
        onClose={() => setConfirmingRemove(false)}
      />
    </ScrollView>
  );
}
