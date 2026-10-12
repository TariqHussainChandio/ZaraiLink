import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ScrollView, StyleSheet } from 'react-native';
import { z } from 'zod';
import {
  Button,
  LocationPicker,
  SelectField,
  TextField,
  useToast,
} from '../../common/components';
import { useCreateFarm } from '../hooks/farmer';
import { useUnits } from '../../common/reference-data';
import { useAuthStore } from '../../state/authStore';
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

export function CreateFarmScreen({
  navigation,
}: HomeScreenProps<'CreateFarm'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const { data: units = [] } = useUnits();
  const createFarm = useCreateFarm();
  const toast = useToast();
  const areaUnits = useMemo(
    () => units.filter(u => u.applies_to === 'area'),
    [units],
  );

  const farmSchema = useMemo(() => buildFarmSchema('Enter a farm name'), []);

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
      await createFarm.mutateAsync({
        name: values.name,
        area: values.area ? Number(values.area) : null,
        landUnit: values.landUnit,
        notes: values.notes || null,
        country: values.country,
        province: values.province,
        city: values.city,
      });
      toast.success('Farm added');
      navigation.goBack();
    } catch (error) {
      toast.error(`Farm not added. ${errorMessage(error)}`);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
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
        label="Create Farm"
        icon={Plus}
        size="lg"
        loading={isSubmitting}
        onPress={handleSubmit(onSubmit)}
        style={styles.submit}
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
    submit: {
      marginTop: space[3],
      marginBottom: space[8],
    },
  });
}
