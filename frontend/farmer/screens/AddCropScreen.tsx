import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Save, Trash2 } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { z } from 'zod';
import {
  Button,
  ScreenState,
  SelectField,
  Sheet,
  TextField,
  useToast,
} from '../../common/components';
import {
  useDeleteFarmCrop,
  useFarmCrop,
  useSaveFarmCrop,
} from '../hooks/farmer';
import { useCrops } from '../../common/marketplace';
import { useTheme, type Theme } from '../../theme';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';
import { errorMessage } from '../../utils/errorMessage';

const dateField = (message: string) =>
  z
    .string()
    .refine(value => !value || /^\d{4}-\d{2}-\d{2}$/.test(value), message);

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

export function AddCropScreen({
  route,
  navigation,
}: HomeScreenProps<'AddCrop'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { farmId, cropId } = route.params;
  const isEditing = Boolean(cropId);
  const { data: crops = [] } = useCrops();
  const farmCropQuery = useFarmCrop(cropId);
  const farmCrop = farmCropQuery.data;
  const saveCrop = useSaveFarmCrop(farmId);
  const removeCrop = useDeleteFarmCrop();
  const toast = useToast();
  const [confirmingRemove, setConfirmingRemove] = useState(false);

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
      toast.success(isEditing ? 'Crop saved' : 'Crop added');
      navigation.goBack();
    } catch (err) {
      toast.error(`Crop not saved. ${errorMessage(err)}`);
    }
  };

  const onDelete = async () => {
    if (!cropId) return;
    try {
      await removeCrop.mutateAsync(cropId);
      setConfirmingRemove(false);
      toast.success('Crop removed');
      navigation.goBack();
    } catch (err) {
      setConfirmingRemove(false);
      toast.error(`Crop not removed. ${errorMessage(err)}`);
    }
  };

  // Editing needs the saved crop first: ScreenState shows the skeleton, or the failure with Retry. A new crop has no
  // query (it is disabled) and goes straight to the empty form.
  if (isEditing && farmCrop === undefined) {
    return (
      <ScreenState query={farmCropQuery} errorTitle="Couldn't load this crop" />
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
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
        label={isEditing ? 'Save Changes' : 'Add Crop'}
        icon={isEditing ? Save : Plus}
        size="lg"
        loading={saveCrop.isPending}
        onPress={handleSubmit(onSubmit)}
        style={styles.action}
      />
      {isEditing ? (
        <Button
          label="Remove Crop"
          icon={Trash2}
          variant="danger"
          size="lg"
          onPress={() => setConfirmingRemove(true)}
          style={styles.delete}
        />
      ) : null}

      <Sheet
        visible={confirmingRemove}
        onClose={() => setConfirmingRemove(false)}
        title="Remove this crop?"
      >
        <Text style={styles.sheetBody}>You cannot undo this.</Text>
        <Button
          label="Remove Crop"
          icon={Trash2}
          variant="danger"
          size="lg"
          loading={removeCrop.isPending}
          onPress={onDelete}
          style={styles.action}
        />
        <Button
          label="Keep Crop"
          variant="secondary"
          size="lg"
          onPress={() => setConfirmingRemove(false)}
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
