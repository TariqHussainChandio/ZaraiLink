import { zodResolver } from '@hookform/resolvers/zod';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { z } from 'zod';
import { Button, EmptyState, Input, SelectField, Spinner } from '../../components/ui';
import {
  createFarmCrop,
  deleteFarmCrop,
  fetchFarmCropById,
  updateFarmCrop,
} from '../../services/modules/farmer/farmService';
import { useMarketplaceStore } from '../../store/marketplaceStore';
import { useTheme, type Theme } from '../../theme';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

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
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { farmId, cropId } = route.params;
  const isEditing = Boolean(cropId);
  const [loading, setLoading] = useState(isEditing);
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const crops = useMarketplaceStore(state => state.crops);
  const loadCrops = useMarketplaceStore(state => state.loadCrops);

  useEffect(() => {
    loadCrops();
  }, [loadCrops]);

  const farmCropSchema = useMemo(
    () => buildFarmCropSchema(t('farmer.addCrop.dateFormatError', 'Use YYYY-MM-DD format')),
    [t],
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

  const load = useCallback(() => {
    if (!cropId) return;
    setLoading(true);
    setError(false);
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
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [cropId, reset]);

  useEffect(() => {
    load();
  }, [load]);

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
    } catch (err) {
      Alert.alert(
        t('farmer.addCrop.saveFailedTitle', 'Failed to save crop'),
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = () => {
    if (!cropId) return;
    Alert.alert(
      t('farmer.addCrop.removeCropAlertTitle', 'Remove crop'),
      t('farmer.addCrop.removeCropAlertMessage', 'This cannot be undone.'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('farmer.addCrop.removeButton', 'Remove'),
          style: 'destructive',
          onPress: async () => {
            await deleteFarmCrop(cropId);
            navigation.goBack();
          },
        },
      ],
    );
  };

  if (loading) return <Spinner fullscreen />;
  if (error) {
    return (
      <EmptyState
        title={t('farmer.addCrop.loadErrorTitle', "Couldn't load this crop")}
        description={t('farmer.addCrop.loadErrorDescription', 'Check your connection and try again.')}
        actionLabel={t('common.retry')}
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
            label={t('farmer.addCrop.cropLabel', 'Crop')}
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
          <Input
            label={t('farmer.addCrop.varietyLabel', 'Variety')}
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
          <Input
            label={t('farmer.addCrop.plantingDateLabel', 'Planting date')}
            placeholder={t('farmer.addCrop.datePlaceholder', 'YYYY-MM-DD')}
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
          <Input
            label={t('farmer.addCrop.areaLabel', 'Area')}
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
          <Input
            label={t('farmer.addCrop.expectedHarvestDateLabel', 'Expected harvest date')}
            placeholder={t('farmer.addCrop.datePlaceholder', 'YYYY-MM-DD')}
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
          <Input
            label={t('farmer.addCrop.growthStageLabel', 'Growth stage')}
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
          <Input
            label={t('farmer.addCrop.notesLabel', 'Notes')}
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
            ? t('farmer.addCrop.saveChangesButton', 'Save Changes')
            : t('farmer.addCrop.addCropButton', 'Add Crop')
        }
        loading={submitting}
        onPress={handleSubmit(onSubmit)}
        style={styles.action}
      />
      {isEditing ? (
        <Button
          label={t('farmer.addCrop.removeCropButton', 'Remove Crop')}
          variant="destructive"
          onPress={onDelete}
          style={styles.delete}
        />
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
