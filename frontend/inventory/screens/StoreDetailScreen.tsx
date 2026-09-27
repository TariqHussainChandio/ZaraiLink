import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect, useMemo, useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { z } from 'zod';
import { Button, EmptyState, Input, LocationPicker, SelectField, Spinner } from '../../components/ui';
import { useDeleteStore, useSaveStore, useStore } from '../../hooks/api/dealer';
import { useAuthStore } from '../../store/authStore';
import { useTheme, type Theme } from '../../theme';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';
import { errorMessage } from '../../utils/errorMessage';

function makeStoreSchema() {
  return z.object({
    name: z.string().min(2, 'Enter a store name'),
    address: z.string(),
    contact: z.string(),
    openingInfo: z.string(),
    status: z.enum(['active', 'inactive']),
    country: z.string().nullable(),
    province: z.string().nullable(),
    city: z.string().nullable(),
  });
}

type StoreFormValues = z.infer<ReturnType<typeof makeStoreSchema>>;

export function StoreDetailScreen({ route, navigation }: HomeScreenProps<'StoreDetail'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const storeId = route.params?.storeId;
  const storeSchema = useMemo(() => makeStoreSchema(), []);
  const STATUS_OPTIONS = useMemo(
    () => [
      { id: 'active', label: 'Active' },
      { id: 'inactive', label: 'Inactive' },
    ],
    [],
  );
  const userId = useAuthStore(state => state.user?.id);
  const saveStore = useSaveStore();
  const removeStore = useDeleteStore();
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

  const { data: store, isLoading: loading, error, refetch } = useStore(storeId);
  const load = () => refetch();

  // Fill the form once, from the first copy of the store; a later background refetch must not overwrite edits.
  const filled = useRef(false);
  useEffect(() => {
    if (!store || filled.current) return;
    filled.current = true;
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
  }, [store, reset]);

  const onSubmit = async (values: StoreFormValues) => {
    if (!userId) return;
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
      await saveStore.mutateAsync({ id: storeId, input });
      navigation.goBack();
    } catch (err) {
      Alert.alert('Failed to save store', errorMessage(err));
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
          try {
            await removeStore.mutateAsync(storeId);
            navigation.goBack();
          } catch (err) {
            Alert.alert('Could not delete the store', errorMessage(err));
          }
        },
      },
    ]);
  };

  if (loading) return <Spinner fullscreen />;
  if (error && !store) {
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
          <Input
            label="Store name"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.name?.message}
          />
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
          <SelectField
            label="Status"
            value={value}
            options={STATUS_OPTIONS}
            onSelect={onChange}
            searchable={false}
          />
        )}
      />

      <Button label="Save Store" loading={saveStore.isPending} onPress={handleSubmit(onSubmit)} style={styles.action} />
      {storeId ? (
        <Button label="Delete Store" variant="destructive" onPress={onDelete} style={styles.delete} />
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
