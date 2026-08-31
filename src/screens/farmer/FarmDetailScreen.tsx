import { zodResolver } from '@hookform/resolvers/zod';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { z } from 'zod';
import { Button, EmptyState, Input, LocationPicker, SelectField, Spinner } from '../../components/ui';
import { HOME_ROUTES } from '../../constants/routes';
import { deleteFarm, fetchFarmById, updateFarm } from '../../services/modules/farmer/farmService';
import { useReferenceDataStore } from '../../store/referenceDataStore';
import { useTheme, type Theme } from '../../theme';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

const farmSchema = z.object({
  name: z.string().min(2, 'Enter a farm name'),
  area: z.string(),
  landUnit: z.string().nullable(),
  notes: z.string(),
  country: z.string().nullable(),
  province: z.string().nullable(),
  city: z.string().nullable(),
});

type FarmFormValues = z.infer<typeof farmSchema>;

export function FarmDetailScreen({ route, navigation }: HomeScreenProps<'FarmDetail'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { farmId } = route.params;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const units = useReferenceDataStore(state => state.units);
  const loadUnits = useReferenceDataStore(state => state.loadUnits);

  useEffect(() => {
    loadUnits();
  }, [loadUnits]);

  const areaUnits = useMemo(() => units.filter(u => u.applies_to === 'area'), [units]);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FarmFormValues>({
    resolver: zodResolver(farmSchema),
    defaultValues: {
      name: '',
      area: '',
      landUnit: null,
      notes: '',
      country: null,
      province: null,
      city: null,
    },
  });

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    fetchFarmById(farmId)
      .then(farm => {
        reset({
          name: farm.name,
          area: farm.area !== null ? String(farm.area) : '',
          landUnit: farm.land_unit,
          notes: farm.notes ?? '',
          country: farm.location?.country ?? null,
          province: farm.location?.province ?? null,
          city: farm.location?.city ?? null,
        });
      })
      .catch(err => {
        console.warn('[FarmDetailScreen] failed to load farm:', err);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [farmId, reset]);

  useEffect(() => {
    load();
  }, [load]);

  const onSubmit = async (values: FarmFormValues) => {
    setSubmitting(true);
    try {
      await updateFarm(farmId, {
        name: values.name,
        area: values.area ? Number(values.area) : null,
        landUnit: values.landUnit,
        notes: values.notes || null,
        country: values.country,
        province: values.province,
        city: values.city,
      });
      navigation.goBack();
    } catch (err) {
      Alert.alert('Failed to update farm', err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = () => {
    Alert.alert('Delete farm', 'This will also remove its recorded crops. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteFarm(farmId);
          navigation.popToTop();
        },
      },
    ]);
  };

  if (loading) return <Spinner fullscreen />;
  if (error) {
    return (
      <EmptyState
        title="Couldn't load this farm"
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
          <Input label="Farm name" value={value} onChangeText={onChange} onBlur={onBlur} error={errors.name?.message} />
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
        name="area"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input label="Area" keyboardType="numeric" value={value} onChangeText={onChange} onBlur={onBlur} />
        )}
      />

      <Controller
        control={control}
        name="landUnit"
        render={({ field: { onChange, value } }) => (
          <SelectField
            label="Land unit"
            value={value}
            options={areaUnits.map(u => ({ id: u.code, label: u.label }))}
            onSelect={onChange}
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

      <Button
        label="Crops on this Farm"
        variant="secondary"
        onPress={() => navigation.navigate(HOME_ROUTES.CropList, { farmId })}
        style={styles.action}
      />
      <Button label="Save Changes" loading={submitting} onPress={handleSubmit(onSubmit)} style={styles.action} />
      <Button label="Delete Farm" variant="destructive" onPress={onDelete} style={styles.delete} />
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
