import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { z } from 'zod';
import { Button, Input, LocationPicker, SelectField, Spinner } from '../../components/ui';
import { HOME_ROUTES } from '../../constants/routes';
import { deleteFarm, fetchFarmById, updateFarm } from '../../services/modules/farmer/farmService';
import { useReferenceDataStore } from '../../store/referenceDataStore';
import { lightTheme } from '../../theme';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

const farmSchema = z.object({
  name: z.string().min(2, 'Enter a farm name'),
  area: z.string(),
  landUnit: z.string().nullable(),
  notes: z.string(),
  countryId: z.string().nullable(),
  provinceId: z.string().nullable(),
  cityId: z.string().nullable(),
});

type FarmFormValues = z.infer<typeof farmSchema>;

const { spacing } = lightTheme;

export function FarmDetailScreen({ route, navigation }: HomeScreenProps<'FarmDetail'>) {
  const { farmId } = route.params;
  const [loading, setLoading] = useState(true);
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
      countryId: null,
      provinceId: null,
      cityId: null,
    },
  });

  useEffect(() => {
    fetchFarmById(farmId)
      .then(farm => {
        reset({
          name: farm.name,
          area: farm.area !== null ? String(farm.area) : '',
          landUnit: farm.land_unit,
          notes: farm.notes ?? '',
          countryId: farm.location?.country_id ?? null,
          provinceId: farm.location?.province_id ?? null,
          cityId: farm.location?.city_id ?? null,
        });
      })
      .catch(err => {
        console.warn('[FarmDetailScreen] failed to load farm:', err);
      })
      .finally(() => setLoading(false));
  }, [farmId, reset]);

  const onSubmit = async (values: FarmFormValues) => {
    setSubmitting(true);
    try {
      await updateFarm(farmId, {
        name: values.name,
        area: values.area ? Number(values.area) : null,
        landUnit: values.landUnit,
        notes: values.notes || null,
        countryId: values.countryId,
        provinceId: values.provinceId,
        cityId: values.cityId,
      });
      navigation.goBack();
    } catch (error) {
      Alert.alert('Failed to update farm', error instanceof Error ? error.message : String(error));
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
        countryId={watch('countryId')}
        provinceId={watch('provinceId')}
        cityId={watch('cityId')}
        onCountryChange={id => setValue('countryId', id)}
        onProvinceChange={id => setValue('provinceId', id)}
        onCityChange={id => setValue('cityId', id)}
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
