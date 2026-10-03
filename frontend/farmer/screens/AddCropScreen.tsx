import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect, useMemo, useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { z } from 'zod';
import { Button, EmptyState, TextField, SelectField, Spinner } from '../../common/components';
import { useDeleteFarmCrop, useFarmCrop, useSaveFarmCrop } from '../hooks/farmer';
import { useCrops } from '../../common/marketplace';
import { useTheme, type Theme } from '../../theme';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';
import { errorMessage } from '../../utils/errorMessage';

const dateField = (message: string) =>
  z.string().refine(value => !value || /^\d{4}-\d{2}-\d{2}$/.test(value), message);

function buildFarmCropSchema(dateMessage: string) {
  return z.object({
    cropId: z.string().nullable(),
    variety: z.string(),
    plantingDate: dateField(dateMessage),
    area: z.string(),
    expectedHarvestDate: dateField(dateMessage),
    growthStage: z.string(),
    notes: z.string(),
  });
}

type FarmCropFormValues = z.infer<ReturnType<typeof buildFarmCropSchema>>;

export function AddCropScreen({ route, navigation }: HomeScreenProps<'AddCrop'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { farmId, cropId } = route.params;
  const isEditing = Boolean(cropId);
  const { data: crops = [] } = useCrops();
  const { data: farmCrop, isLoading: loading, error, refetch } = useFarmCrop(cropId);
  const saveCrop = useSaveFarmCrop(farmId);
  const removeCrop = useDeleteFarmCrop();
  const load = () => refetch();

  const farmCropSchema = useMemo(
    () => buildFarmCropSchema('Use YYYY-MM-DD format'),
    [],
  );

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FarmCropFormValues>({
    resolver: zodResolver(farmCropSchema),
    defaultValues: {
      cropId: null,
      variety: '',
      plantingDate: '',
      area: '',
      expectedHarvestDate: '',
      growthStage: '',
      notes: '',
    },
  });

  // Fill the form once, from the first copy of the crop; a later background refetch must not overwrite edits.
  const filled = useRef(false);
  useEffect(() => {
    if (!farmCrop || filled.current) return;
    filled.current = true;
    reset({
      cropId: farmCrop.crop_id,
      variety: farmCrop.variety ?? '',
      plantingDate: farmCrop.planting_date ?? '',
      area: farmCrop.area !== null ? String(farmCrop.area) : '',
      expectedHarvestDate: farmCrop.expected_harvest_date ?? '',
      growthStage: farmCrop.growth_stage ?? '',
      notes: farmCrop.notes ?? '',
    });
  }, [farmCrop, reset]);

  const onSubmit = async (values: FarmCropFormValues) => {
    try {
      const input = {
        cropId: values.cropId,
        variety: values.variety || null,
        plantingDate: values.plantingDate || null,
        area: values.area ? Number(values.area) : null,
        expectedHarvestDate: values.expectedHarvestDate || null,
        growthStage: values.growthStage || null,
        notes: values.notes || null,
      };
      await saveCrop.mutateAsync({ cropId, input });
      navigation.goBack();
    } catch (err) {
      Alert.alert(
        'Failed to save crop',
        errorMessage(err),
      );
    }
  };

  const onDelete = () => {
    if (!cropId) return;
    Alert.alert(
      'Remove crop',
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeCrop.mutateAsync(cropId);
              navigation.goBack();
            } catch (err) {
              Alert.alert('Failed to remove crop', errorMessage(err));
            }
          },
        },
      ],
    );
  };

  if (loading) return <Spinner fullscreen />;
  if (error && !farmCrop) {
    return (
      <EmptyState
        title="Couldn't load this crop"
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
        name="cropId"
        render={({ field: { onChange, value } }) => (
          <SelectField
            label="Crop"
            value={value}
            options={crops.map(c => ({ id: c.id, label: c.name }))}
            onSelect={onChange}
          />
        )}
      />

      <Controller
        control={control}
        name="variety"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Variety"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
          />
        )}
      />

      <Controller
        control={control}
        name="plantingDate"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Planting date"
            placeholder="YYYY-MM-DD"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.plantingDate?.message}
          />
        )}
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
        name="expectedHarvestDate"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Expected harvest date"
            placeholder="YYYY-MM-DD"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.expectedHarvestDate?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="growthStage"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Growth stage"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
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
        label={
          isEditing
            ? 'Save Changes'
            : 'Add Crop'
        }
        loading={saveCrop.isPending}
        onPress={handleSubmit(onSubmit)}
        style={styles.action}
      />
      {isEditing ? (
        <Button
          label="Remove Crop"
          variant="danger"
          onPress={onDelete}
          style={styles.delete}
        />
      ) : null}
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
