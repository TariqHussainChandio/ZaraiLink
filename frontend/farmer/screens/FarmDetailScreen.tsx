import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect, useMemo, useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { z } from 'zod';
import { Button, EmptyState, TextField, LocationPicker, SelectField, Spinner } from '../../common/components';
import { HOME_ROUTES } from '../../common/constants/routes';
import { useDeleteFarm, useFarm, useUpdateFarm } from '../hooks/farmer';
import { useUnits } from '../../common/reference-data';
import { useTheme, type Theme } from '../../theme';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';
import { errorMessage } from '../../utils/errorMessage';

function buildFarmSchema(nameRequiredMessage: string) {
  return z.object({
    name: z.string().min(2, nameRequiredMessage),
    area: z.string(),
    landUnit: z.string().nullable(),
    notes: z.string(),
    country: z.string().nullable(),
    province: z.string().nullable(),
    city: z.string().nullable(),
  });
}

type FarmFormValues = z.infer<ReturnType<typeof buildFarmSchema>>;

export function FarmDetailScreen({ route, navigation }: HomeScreenProps<'FarmDetail'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { farmId } = route.params;
  const { data: units = [] } = useUnits();
  const { data: farm, isPending: loading, error, refetch } = useFarm(farmId);
  const updateFarm = useUpdateFarm(farmId);
  const removeFarm = useDeleteFarm();
  const load = () => refetch();
  const areaUnits = useMemo(() => units.filter(u => u.applies_to === 'area'), [units]);

  const farmSchema = useMemo(
    () => buildFarmSchema('Enter a farm name'),
    [],
  );

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

  // Fill the form once, from the first copy of the farm; a later background refetch must not overwrite edits.
  const filled = useRef(false);
  useEffect(() => {
    if (!farm || filled.current) return;
    filled.current = true;
    reset({
      name: farm.name,
      area: farm.area !== null ? String(farm.area) : '',
      landUnit: farm.land_unit,
      notes: farm.notes ?? '',
      country: farm.location?.country ?? null,
      province: farm.location?.province ?? null,
      city: farm.location?.city ?? null,
    });
  }, [farm, reset]);

  const onSubmit = async (values: FarmFormValues) => {
    try {
      await updateFarm.mutateAsync({
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
      Alert.alert(
        'Failed to update farm',
        errorMessage(err),
      );
    }
  };

  const onDelete = () => {
    Alert.alert(
      'Delete farm',
      'This will also remove its recorded crops. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeFarm.mutateAsync(farmId);
              navigation.popToTop();
            } catch (err) {
              Alert.alert('Failed to delete farm', errorMessage(err));
            }
          },
        },
      ],
    );
  };

  if (loading) return <Spinner fullscreen />;
  if (error && !farm) {
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
          <TextField
            label="Farm name"
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
        name="area"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Area"
            keyboardType="numeric"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
          />
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
          <TextField
            label="Notes"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            multiline
            numberOfLines={3}
          />
        )}
      />

      <Button
        label="Crops on this Farm"
        variant="secondary"
        onPress={() => navigation.navigate(HOME_ROUTES.CropList, { farmId })}
        style={styles.action}
      />
      <Button
        label="Save Changes"
        loading={updateFarm.isPending}
        onPress={handleSubmit(onSubmit)}
        style={styles.action}
      />
      <Button
        label="Delete Farm"
        variant="danger"
        onPress={onDelete}
        style={styles.delete}
      />
    </ScrollView>
  );
}

function makeStyles({ colors, space }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    content: {
      padding: space[4],
    },
    action: {
      marginTop: space[3],
    },
    delete: {
      marginTop: space[3],
      marginBottom: space[8],
    },
  });
}
