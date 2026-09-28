import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect, useMemo, useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { z } from 'zod';
import { Button, EmptyState, Input, SelectField, Spinner } from '../../common/components';
import { useDeleteSupplier, useSaveSupplier, useSupplier } from '../hooks/dealer';
import { useAuthStore } from '../../state/authStore';
import { useTheme, type Theme } from '../../theme';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';
import { errorMessage } from '../../utils/errorMessage';

function makeSupplierSchema() {
  return z.object({
    name: z.string().min(2, 'Enter a supplier name'),
    contact: z.string(),
    productsSupplied: z.string(),
    notes: z.string(),
    status: z.enum(['active', 'inactive']),
  });
}

type SupplierFormValues = z.infer<ReturnType<typeof makeSupplierSchema>>;

export function SupplierDetailScreen({ route, navigation }: HomeScreenProps<'SupplierDetail'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const supplierId = route.params?.supplierId;
  const supplierSchema = useMemo(() => makeSupplierSchema(), []);
  const STATUS_OPTIONS = useMemo(
    () => [
      { id: 'active', label: 'Active' },
      { id: 'inactive', label: 'Inactive' },
    ],
    [],
  );
  const userId = useAuthStore(state => state.user?.id);
  const saveSupplier = useSaveSupplier();
  const removeSupplier = useDeleteSupplier();
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

  const { data: supplier, isLoading: loading, error, refetch } = useSupplier(supplierId);
  const load = () => refetch();

  // Fill the form once, from the first copy of the supplier; a later background refetch must not overwrite edits.
  const filled = useRef(false);
  useEffect(() => {
    if (!supplier || filled.current) return;
    filled.current = true;
    reset({
      name: supplier.name,
      contact: supplier.contact ?? '',
      productsSupplied: supplier.products_supplied ?? '',
      notes: supplier.notes ?? '',
      status: supplier.status,
    });
  }, [supplier, reset]);

  const onSubmit = async (values: SupplierFormValues) => {
    if (!userId) return;
    try {
      const input = {
        name: values.name,
        contact: values.contact || null,
        productsSupplied: values.productsSupplied || null,
        notes: values.notes || null,
        status: values.status,
      };
      await saveSupplier.mutateAsync({ id: supplierId, input });
      navigation.goBack();
    } catch (err) {
      Alert.alert('Failed to save supplier', errorMessage(err));
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
          try {
            await removeSupplier.mutateAsync(supplierId);
            navigation.goBack();
          } catch (err) {
            Alert.alert('Could not delete the supplier', errorMessage(err));
          }
        },
      },
    ]);
  };

  if (loading) return <Spinner fullscreen />;
  if (error && !supplier) {
    return (
      <EmptyState
        title="Couldn't load this supplier"
        description="Check your connection and try again."
        actionLabel="Retry"
        onAction={load}
      />
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Controller
        control={control}
        name="name"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
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
          <Input
            label="Contact"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            keyboardType="phone-pad"
          />
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
          <Input
            label="Notes"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            multiline
            numberOfLines={3}
          />
        )}
      />

      <Controller
        control={control}
        name="status"
        render={({ field: { onChange, value } }) => (
          <SelectField
            label="Status"
            value={value}
            options={STATUS_OPTIONS}
            onSelect={onChange}
            searchable={false}
          />
        )}
      />

      <Button label="Save Supplier" loading={saveSupplier.isPending} onPress={handleSubmit(onSubmit)} style={styles.action} />
      {supplierId ? (
        <Button label="Delete Supplier" variant="destructive" onPress={onDelete} style={styles.delete} />
      ) : null}
    </ScrollView>
  );
}

function makeStyles({ colors, spacing }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.surface,
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
}
