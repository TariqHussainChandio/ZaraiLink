import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { z } from 'zod';
import { Button, Input, LocationPicker, SelectField } from '../../components/ui';
import { createFarm } from '../../services/modules/farmer/farmService';
import { useAuthStore } from '../../store/authStore';
import { useReferenceDataStore } from '../../store/referenceDataStore';
import { useTheme, type Theme } from '../../theme';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

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

export function CreateFarmScreen({ navigation }: HomeScreenProps<'CreateFarm'>) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const units = useReferenceDataStore(state => state.units);
  const loadUnits = useReferenceDataStore(state => state.loadUnits);

  useEffect(() => {
    loadUnits();
  }, [loadUnits]);

  const areaUnits = useMemo(() => units.filter(u => u.applies_to === 'area'), [units]);

  const farmSchema = useMemo(
    () => buildFarmSchema(t('farmer.createFarm.nameRequiredError', 'Enter a farm name')),
    [t],
  );

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
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

  const onSubmit = async (values: FarmFormValues) => {
    if (!userId) return;
    try {
      await createFarm({
        name: values.name,
        area: values.area ? Number(values.area) : null,
        landUnit: values.landUnit,
        notes: values.notes || null,
        country: values.country,
        province: values.province,
        city: values.city,
      });
      navigation.goBack();
    } catch (error) {
      Alert.alert(
        t('farmer.createFarm.createFailedTitle', 'Failed to create farm'),
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Controller
        control={control}
        name="name"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            label={t('farmer.createFarm.farmNameLabel', 'Farm name')}
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
          <Input
            label={t('farmer.createFarm.areaLabel', 'Area')}
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
            label={t('farmer.createFarm.landUnitLabel', 'Land unit')}
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
          <Input
            label={t('farmer.createFarm.notesLabel', 'Notes')}
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            multiline
            numberOfLines={3}
          />
        )}
      />

      <Button
        label={t('farmer.createFarm.createFarmButton', 'Create Farm')}
        loading={isSubmitting}
        onPress={handleSubmit(onSubmit)}
        style={styles.submit}
      />
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
    submit: {
      marginTop: spacing.md,
      marginBottom: spacing['2xl'],
    },
  });
}
