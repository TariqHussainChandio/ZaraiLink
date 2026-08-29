import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { z } from 'zod';
import { Button, Input, SelectField, Spinner } from '../../components/ui';
import {
  createFarmCrop,
  deleteFarmCrop,
  fetchFarmCropById,
  updateFarmCrop,
} from '../../services/modules/farmer/farmService';
import { useMarketplaceStore } from '../../store/marketplaceStore';
import { lightTheme } from '../../theme';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

const DATE_MESSAGE = 'Use YYYY-MM-DD format';
const dateField = z.string().refine(value => !value || /^\d{4}-\d{2}-\d{2}$/.test(value), DATE_MESSAGE);

const farmCropSchema = z.object({
  cropId: z.string().nullable(),
  variety: z.string(),
  plantingDate: dateField,
  area: z.string(),
  expectedHarvestDate: dateField,
  growthStage: z.string(),
  notes: z.string(),
});

type FarmCropFormValues = z.infer<typeof farmCropSchema>;

const { spacing } = lightTheme;

export function AddCropScreen({ route, navigation }: HomeScreenProps<'AddCrop'>) {
  const { farmId, cropId } = route.params;
  const isEditing = Boolean(cropId);
  const [loading, setLoading] = useState(isEditing);
  const [submitting, setSubmitting] = useState(false);

  const crops = useMarketplaceStore(state => state.crops);
  const loadCrops = useMarketplaceStore(state => state.loadCrops);

  useEffect(() => {
    loadCrops();
  }, [loadCrops]);

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

  useEffect(() => {
    if (!cropId) return;
    fetchFarmCropById(cropId)
      .then(crop => {
        reset({
          cropId: crop.crop_id,
          variety: crop.variety ?? '',
          plantingDate: crop.planting_date ?? '',
          area: crop.area !== null ? String(crop.area) : '',
          expectedHarvestDate: crop.expected_harvest_date ?? '',
          growthStage: crop.growth_stage ?? '',
          notes: crop.notes ?? '',
        });
      })
      .catch(err => {
        console.warn('[AddCropScreen] failed to load crop:', err);
      })
      .finally(() => setLoading(false));
  }, [cropId, reset]);

  const onSubmit = async (values: FarmCropFormValues) => {
    setSubmitting(true);
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
      if (isEditing && cropId) {
        await updateFarmCrop(cropId, input);
      } else {
        await createFarmCrop(farmId, input);
      }
      navigation.goBack();
    } catch (error) {
      Alert.alert('Failed to save crop', error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = () => {
    if (!cropId) return;
    Alert.alert('Remove crop', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteFarmCrop(cropId);
          navigation.goBack();
        },
      },
    ]);
  };

  if (loading) return <Spinner fullscreen />;

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
          <Input label="Variety" value={value} onChangeText={onChange} onBlur={onBlur} />
        )}
      />

      <Controller
        control={control}
        name="plantingDate"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
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
          <Input label="Area" keyboardType="numeric" value={value} onChangeText={onChange} onBlur={onBlur} />
        )}
      />

      <Controller
        control={control}
        name="expectedHarvestDate"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
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
          <Input label="Growth stage" value={value} onChangeText={onChange} onBlur={onBlur} />
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
        label={isEditing ? 'Save Changes' : 'Add Crop'}
        loading={submitting}
        onPress={handleSubmit(onSubmit)}
        style={styles.action}
      />
      {isEditing ? (
        <Button label="Remove Crop" variant="destructive" onPress={onDelete} style={styles.delete} />
      ) : null}
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
