import { zodResolver } from '@hookform/resolvers/zod';
import { Save, Sprout, Trash2 } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { z } from 'zod';
import {
  Button,
  LocationPicker,
  ScreenState,
  SelectField,
  Sheet,
  TextField,
  useToast,
} from '../../common/components';
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

export function FarmDetailScreen({
  route,
  navigation,
}: HomeScreenProps<'FarmDetail'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { farmId } = route.params;
  const { data: units = [] } = useUnits();
  const farmQuery = useFarm(farmId);
  const farm = farmQuery.data;
  const updateFarm = useUpdateFarm(farmId);
  const removeFarm = useDeleteFarm();
  const toast = useToast();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const areaUnits = useMemo(
    () => units.filter(u => u.applies_to === 'area'),
    [units],
  );

  const farmSchema = useMemo(() => buildFarmSchema('Enter a farm name'), []);

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
      toast.success('Farm saved');
      navigation.goBack();
    } catch (err) {
      toast.error(`Farm not saved. ${errorMessage(err)}`);
    }
  };

  const onDelete = async () => {
    try {
      await removeFarm.mutateAsync(farmId);
      setConfirmingDelete(false);
      toast.success('Farm deleted');
      navigation.popToTop();
    } catch (err) {
      setConfirmingDelete(false);
      toast.error(`Farm not deleted. ${errorMessage(err)}`);
    }
  };

  // Until the first copy arrives the form has nothing to edit: ScreenState shows the skeleton, or the failure with Retry.
  if (farm === undefined)
    return (
      <ScreenState query={farmQuery} errorTitle="Couldn't load this farm" />
    );

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
        label="Crops on this Farm"
        icon={Sprout}
        variant="secondary"
        size="lg"
        onPress={() => navigation.navigate(HOME_ROUTES.CropList, { farmId })}
        style={styles.action}
      />
      <Button
        label="Save Changes"
        icon={Save}
        size="lg"
        loading={updateFarm.isPending}
        onPress={handleSubmit(onSubmit)}
        style={styles.action}
      />
      <Button
        label="Delete Farm"
        icon={Trash2}
        variant="danger"
        size="lg"
        onPress={() => setConfirmingDelete(true)}
        style={styles.delete}
      />

      <Sheet
        visible={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        title="Delete this farm?"
      >
        <Text style={styles.sheetBody}>
          Its crops are removed too. You cannot undo this.
        </Text>
        <Button
          label="Delete Farm"
          icon={Trash2}
          variant="danger"
          size="lg"
          loading={removeFarm.isPending}
          onPress={onDelete}
          style={styles.action}
        />
        <Button
          label="Keep Farm"
          variant="secondary"
          size="lg"
          onPress={() => setConfirmingDelete(false)}
          style={styles.action}
        />
      </Sheet>
    </ScrollView>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
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
    sheetBody: {
      ...typography.body,
      color: colors.ink2,
    },
  });
}
