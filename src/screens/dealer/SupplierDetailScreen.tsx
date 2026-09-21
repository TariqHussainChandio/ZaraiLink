import { zodResolver } from '@hookform/resolvers/zod';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { z } from 'zod';
import { Button, EmptyState, Input, SelectField, Spinner } from '../../components/ui';
import {
  createSupplier,
  deleteSupplier,
  fetchSupplierById,
  updateSupplier,
} from '../../services/modules/dealer/supplierService';
import { useAuthStore } from '../../store/authStore';
import { useTheme, type Theme } from '../../theme';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

function makeSupplierSchema(t: (key: string) => string) {
  return z.object({
    name: z.string().min(2, t('dealer.supplierDetail.nameRequired')),
    contact: z.string(),
    productsSupplied: z.string(),
    notes: z.string(),
    status: z.enum(['active', 'inactive']),
  });
}

type SupplierFormValues = z.infer<ReturnType<typeof makeSupplierSchema>>;

export function SupplierDetailScreen({ route, navigation }: HomeScreenProps<'SupplierDetail'>) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const supplierId = route.params?.supplierId;
  const supplierSchema = useMemo(() => makeSupplierSchema(t), [t]);
  const STATUS_OPTIONS = useMemo(
    () => [
      { id: 'active', label: t('dealer.shared.statusActive') },
      { id: 'inactive', label: t('dealer.shared.statusInactive') },
    ],
    [t],
  );
  const userId = useAuthStore(state => state.user?.id);
  const [loading, setLoading] = useState(!!supplierId);
  const [error, setError] = useState(false);
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

  const load = useCallback(() => {
    if (!supplierId) return;
    setLoading(true);
    setError(false);
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
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [supplierId, reset]);

  useEffect(() => {
    load();
  }, [load]);

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
    } catch (err) {
      Alert.alert(t('dealer.supplierDetail.saveFailedTitle'), err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = () => {
    if (!supplierId) return;
    Alert.alert(t('dealer.supplierDetail.deleteConfirmTitle'), t('dealer.shared.cannotBeUndone'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('dealer.shared.deleteAction'),
        style: 'destructive',
        onPress: async () => {
          await deleteSupplier(supplierId);
          navigation.goBack();
        },
      },
    ]);
  };

  if (loading) return <Spinner fullscreen />;
  if (error) {
    return (
      <EmptyState
        title={t('dealer.supplierDetail.couldntLoadTitle')}
        description={t('dealer.shared.checkConnectionDescription')}
        actionLabel={t('common.retry')}
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
            label={t('dealer.supplierDetail.supplierNameLabel')}
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
            label={t('dealer.supplierDetail.contactLabel')}
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
            label={t('dealer.supplierDetail.productsSuppliedLabel')}
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
            label={t('dealer.supplierDetail.notesLabel')}
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
            label={t('dealer.supplierDetail.statusLabel')}
            value={value}
            options={STATUS_OPTIONS}
            onSelect={onChange}
            searchable={false}
          />
        )}
      />

      <Button label={t('dealer.supplierDetail.saveButton')} loading={submitting} onPress={handleSubmit(onSubmit)} style={styles.action} />
      {supplierId ? (
        <Button label={t('dealer.supplierDetail.deleteButton')} variant="destructive" onPress={onDelete} style={styles.delete} />
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
