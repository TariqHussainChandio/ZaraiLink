import { zodResolver } from '@hookform/resolvers/zod';
import React, { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Button,
  ConfirmSheet,
  QueryState,
  ScreenScaffold,
  SelectField,
  StickyActionBar,
  TextField,
  useSnackbar,
} from '../../common/components';
import { useCrops } from '../../common/marketplace';
import { useUnits } from '../../common/reference-data';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';
import { errorMessage } from '../../utils/errorMessage';
import { ChoiceField } from '../components/ChoiceField';
import { DATE_HELPER, growthStageOptions, isValidArea, isValidDate, parseArea } from '../constants/forms';
import { useDeleteFarmCrop, useFarm, useFarmCrop, useSaveFarmCrop } from '../hooks/farmer';
import type { FarmCropWithCrop } from '../types/farmer';

const dateMessage = 'Use year-month-day, for example 2026-03-14';

const cropSchema = z
  .object({
    cropId: z.string().min(1, 'Choose a crop'),
    variety: z.string(),
    plantingDate: z.string().refine(isValidDate, dateMessage),
    expectedHarvestDate: z.string().refine(isValidDate, dateMessage),
    area: z.string().refine(isValidArea, 'Enter the area as a number, for example 2.5'),
    growthStage: z.string(),
    notes: z.string(),
  })
  // Both dates are year-month-day text, so comparing the text compares the days.
  .refine(v => !v.plantingDate.trim() || !v.expectedHarvestDate.trim() || v.expectedHarvestDate >= v.plantingDate, {
    path: ['expectedHarvestDate'],
    message: 'The harvest date cannot be before the planting date',
  });

type CropFormValues = z.infer<typeof cropSchema>;

const EMPTY_CROP: CropFormValues = {
  cropId: '',
  variety: '',
  plantingDate: '',
  expectedHarvestDate: '',
  area: '',
  growthStage: '',
  notes: '',
};

function cropToFormValues(crop: FarmCropWithCrop): CropFormValues {
  return {
    cropId: crop.crop_id ?? '',
    variety: crop.variety ?? '',
    plantingDate: crop.planting_date ?? '',
    expectedHarvestDate: crop.expected_harvest_date ?? '',
    area: crop.area !== null ? String(crop.area) : '',
    growthStage: crop.growth_stage ?? '',
    notes: crop.notes ?? '',
  };
}

/** Adds a crop to a farm, or edits one (FA-22): the crop is required, the rest are marked optional, the stage is chosen
 * from chips and the area is a number. Dates are typed with their format shown, until the native picker is allowed. */
export function AddCropScreen({ route, navigation }: HomeScreenProps<'AddCrop'>) {
  const { farmId, cropId } = route.params;
  const cropQuery = useFarmCrop(cropId);

  if (cropId && !cropQuery.data) {
    return (
      <ScreenScaffold>
        <QueryState query={cropQuery} failureTitle="Couldn't load this crop">
          {null}
        </QueryState>
      </ScreenScaffold>
    );
  }
  return (
    <CropForm
      farmId={farmId}
      cropId={cropId}
      initial={cropQuery.data ? cropToFormValues(cropQuery.data) : EMPTY_CROP}
      goBack={navigation.goBack}
    />
  );
}

interface CropFormProps {
  farmId: string;
  cropId?: string;
  initial: CropFormValues;
  goBack: () => void;
}

function CropForm({ farmId, cropId, initial, goBack }: CropFormProps) {
  const isEditing = Boolean(cropId);
  const snackbar = useSnackbar();
  const { data: crops = [] } = useCrops();
  const { data: units = [] } = useUnits();
  const { data: farm } = useFarm(farmId);
  const saveCrop = useSaveFarmCrop(farmId);
  const removeCrop = useDeleteFarmCrop();
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<CropFormValues>({ resolver: zodResolver(cropSchema), defaultValues: initial });

  const stageOptions = useMemo(() => growthStageOptions(initial.growthStage), [initial.growthStage]);
  // A crop's area is in its farm's unit; the form says so instead of asking for a second unit.
  const farmUnit = units.find(u => u.code === farm?.land_unit)?.label ?? farm?.land_unit ?? undefined;
  const chosenCrop = crops.find(c => c.id === watch('cropId'))?.name;

  const onSubmit = async (values: CropFormValues) => {
    try {
      await saveCrop.mutateAsync({
        cropId,
        input: {
          cropId: values.cropId,
          variety: values.variety.trim() || null,
          plantingDate: values.plantingDate.trim() || null,
          area: parseArea(values.area),
          expectedHarvestDate: values.expectedHarvestDate.trim() || null,
          growthStage: values.growthStage || null,
          notes: values.notes.trim() || null,
        },
      });
    } catch (err) {
      snackbar.show(`Couldn't save the crop. ${errorMessage(err)}`);
      return;
    }
    snackbar.show(isEditing ? 'Crop updated' : 'Crop added');
    goBack();
  };

  const onRemove = async () => {
    if (!cropId) return;
    await removeCrop.mutateAsync(cropId);
    snackbar.show('Crop removed');
    goBack();
  };

  return (
    <>
      <ScreenScaffold
        footer={
          <StickyActionBar>
            <Button label={isEditing ? 'Save changes' : 'Add crop'} size="lg" loading={saveCrop.isPending} onPress={handleSubmit(onSubmit)} />
          </StickyActionBar>
        }
      >
        <Controller
          control={control}
          name="cropId"
          render={({ field: { onChange, value } }) => (
            <SelectField
              label="Crop"
              placeholder="Choose a crop"
              value={value || null}
              options={crops.map(c => ({ id: c.id, label: c.name }))}
              onSelect={onChange}
              error={errors.cropId?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="variety"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField label="Variety" optional value={value} onChangeText={onChange} onBlur={onBlur} />
          )}
        />

        <Controller
          control={control}
          name="plantingDate"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Planting date"
              optional
              placeholder="2026-03-14"
              helper={DATE_HELPER}
              keyboardType="numbers-and-punctuation"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.plantingDate?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="expectedHarvestDate"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label="Expected harvest date"
              optional
              placeholder="2026-08-20"
              helper={DATE_HELPER}
              keyboardType="numbers-and-punctuation"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.expectedHarvestDate?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="area"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField
              label={chosenCrop ? `Area of ${chosenCrop}` : 'Area'}
              optional
              numeric
              keyboardType="decimal-pad"
              suffix={farmUnit}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.area?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="growthStage"
          render={({ field: { onChange, value } }) => (
            <ChoiceField label="Growth stage" optional options={stageOptions} value={value} onChange={onChange} />
          )}
        />

        <Controller
          control={control}
          name="notes"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextField label="Notes" optional value={value} onChangeText={onChange} onBlur={onBlur} multiline numberOfLines={3} />
          )}
        />

        {isEditing ? <Button label="Remove this crop" variant="dangerQuiet" onPress={() => setConfirmingRemove(true)} /> : null}
      </ScreenScaffold>

      <ConfirmSheet
        visible={confirmingRemove}
        onClose={() => setConfirmingRemove(false)}
        title={chosenCrop ? `Remove ${chosenCrop}?` : 'Remove this crop?'}
        message="It is taken off this farm's record. This cannot be undone."
        confirmLabel="Remove crop"
        keepLabel="Keep the crop"
        destructive
        onConfirm={onRemove}
      />
    </>
  );
}
