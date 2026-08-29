import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { z } from 'zod';
import { Button, Input, SelectField, Spinner } from '../../components/ui';
import {
  createSupplier,
  deleteSupplier,
  fetchSupplierById,
  updateSupplier,
} from '../../services/modules/dealer/supplierService';
import { useAuthStore } from '../../store/authStore';
import { lightTheme } from '../../theme';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

const STATUS_OPTIONS = [
  { id: 'active', label: 'Active' },
  { id: 'inactive', label: 'Inactive' },
];

const supplierSchema = z.object({
  name: z.string().min(2, 'Enter a supplier name'),
  contact: z.string(),
  productsSupplied: z.string(),
  notes: z.string(),
  status: z.enum(['active', 'inactive']),
});

type SupplierFormValues = z.infer<typeof supplierSchema>;

const { spacing } = lightTheme;

export function SupplierDetailScreen({ route, navigation }: HomeScreenProps<'SupplierDetail'>) {
  const supplierId = route.params?.supplierId;
  const userId = useAuthStore(state => state.user?.id);
  const [loading, setLoading] = useState(!!supplierId);
  const [submitting, setSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: '',
      contact: '',
      productsSupplied: '',
      notes: '',
      status: 'active',
    },
  });

  useEffect(() => {
    if (!supplierId) return;
    fetchSupplierById(supplierId)
      .then(supplier => {
        reset({
          name: supplier.name,
          contact: supplier.contact ?? '',
          productsSupplied: supplier.products_supplied ?? '',
          notes: supplier.notes ?? '',
          status: supplier.status,
        });
      })
      .catch(err => {
        console.warn('[SupplierDetailScreen] failed to load supplier:', err);
      })
      .finally(() => setLoading(false));
  }, [supplierId, reset]);

  const onSubmit = async (values: SupplierFormValues) => {
    if (!userId) return;
    setSubmitting(true);
    try {
      const input = {
        name: values.name,
        contact: values.contact || null,
        productsSupplied: values.productsSupplied || null,
        notes: values.notes || null,
        status: values.status,
      };
      if (supplierId) {
        await updateSupplier(supplierId, input);
      } else {
        await createSupplier(input);
      }
      navigation.goBack();
    } catch (error) {
      Alert.alert('Failed to save supplier', error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = () => {
    if (!supplierId) return;
    Alert.alert('Delete supplier', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteSupplier(supplierId);
          navigation.goBack();
        },
      },
    ]);
  };

  if (loading) return <Spinner fullscreen />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Controller
        control={control}
        name="name"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input label="Supplier name" value={value} onChangeText={onChange} onBlur={onBlur} error={errors.name?.message} />
        )}
      />

      <Controller
        control={control}
        name="contact"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input label="Contact" value={value} onChangeText={onChange} onBlur={onBlur} keyboardType="phone-pad" />
        )}
      />

      <Controller
        control={control}
        name="productsSupplied"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            label="Products supplied"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            multiline
            numberOfLines={2}
          />
        )}
      />

      <Controller
        control={control}
        name="notes"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input label="Notes" value={value} onChangeText={onChange} onBlur={onBlur} multiline numberOfLines={3} />
        )}
      />

      <Controller
        control={control}
        name="status"
        render={({ field: { onChange, value } }) => (
          <SelectField label="Status" value={value} options={STATUS_OPTIONS} onSelect={onChange} searchable={false} />
        )}
      />

      <Button label="Save Supplier" loading={submitting} onPress={handleSubmit(onSubmit)} style={styles.action} />
      {supplierId ? (
        <Button label="Delete Supplier" variant="destructive" onPress={onDelete} style={styles.delete} />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightTheme.colors.neutral.white,
  },
  content: {
    padding: spacing.lg,
  },
  action: {
    marginTop: spacing.md,
  },
  delete: {
    marginTop: spacing.md,
    marginBottom: spacing['2xl'],
  },
});
