import { zodResolver } from '@hookform/resolvers/zod';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { z } from 'zod';
import { Button, EmptyState, Input, LocationPicker, SelectField, Spinner } from '../../components/ui';
import {
  createStore,
  deleteStore,
  fetchStoreById,
  updateStore,
} from '../../services/modules/dealer/storeService';
import { useAuthStore } from '../../store/authStore';
import { useTheme, type Theme } from '../../theme';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

const STATUS_OPTIONS = [
  { id: 'active', label: 'Active' },
  { id: 'inactive', label: 'Inactive' },
];

const storeSchema = z.object({
  name: z.string().min(2, 'Enter a store name'),
  address: z.string(),
  contact: z.string(),
  openingInfo: z.string(),
  status: z.enum(['active', 'inactive']),
  country: z.string().nullable(),
  province: z.string().nullable(),
  city: z.string().nullable(),
});

type StoreFormValues = z.infer<typeof storeSchema>;

export function StoreDetailScreen({ route, navigation }: HomeScreenProps<'StoreDetail'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const storeId = route.params?.storeId;
  const userId = useAuthStore(state => state.user?.id);
  const [loading, setLoading] = useState(!!storeId);
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<StoreFormValues>({
    resolver: zodResolver(storeSchema),
    defaultValues: {
      name: '',
      address: '',
      contact: '',
      openingInfo: '',
      status: 'active',
      country: null,
      province: null,
      city: null,
    },
  });

  const load = useCallback(() => {
    if (!storeId) return;
    setLoading(true);
    setError(false);
    fetchStoreById(storeId)
      .then(store => {
        reset({
          name: store.name,
          address: store.address ?? '',
          contact: store.contact ?? '',
          openingInfo: store.opening_info ?? '',
          status: store.status,
          country: store.location?.country ?? null,
          province: store.location?.province ?? null,
          city: store.location?.city ?? null,
        });
      })
      .catch(err => {
        console.warn('[StoreDetailScreen] failed to load store:', err);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [storeId, reset]);

  useEffect(() => {
    load();
  }, [load]);

  const onSubmit = async (values: StoreFormValues) => {
    if (!userId) return;
    setSubmitting(true);
    try {
      const input = {
        name: values.name,
        address: values.address || null,
        contact: values.contact || null,
        openingInfo: values.openingInfo || null,
        status: values.status,
        country: values.country,
        province: values.province,
        city: values.city,
      };
      if (storeId) {
        await updateStore(storeId, input);
      } else {
        await createStore(input);
      }
      navigation.goBack();
    } catch (err) {
      Alert.alert('Failed to save store', err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = () => {
    if (!storeId) return;
    Alert.alert('Delete store', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteStore(storeId);
          navigation.goBack();
        },
      },
    ]);
  };

  if (loading) return <Spinner fullscreen />;
  if (error) {
    return (
      <EmptyState
        title="Couldn't load this store"
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
          <Input label="Store name" value={value} onChangeText={onChange} onBlur={onBlur} error={errors.name?.message} />
        )}
      />

      <LocationPicker
        country={watch('country')}
        province={watch('province')}
        city={watch('city')}
        onCountryChange={value => setValue('country', value)}
        onProvinceChange={value => setValue('province', value)}
        onCityChange={value => setValue('city', value)}
      />

      <Controller
        control={control}
        name="address"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input label="Address" value={value} onChangeText={onChange} onBlur={onBlur} />
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
        name="openingInfo"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            label="Opening hours / info"
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
        name="status"
        render={({ field: { onChange, value } }) => (
          <SelectField label="Status" value={value} options={STATUS_OPTIONS} onSelect={onChange} searchable={false} />
        )}
      />

      <Button label="Save Store" loading={submitting} onPress={handleSubmit(onSubmit)} style={styles.action} />
      {storeId ? <Button label="Delete Store" variant="destructive" onPress={onDelete} style={styles.delete} /> : null}
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
