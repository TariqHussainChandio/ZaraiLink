import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect, useMemo, useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { z } from 'zod';
import { Banner, Chip, LocationPicker, TextField } from '../../../components';
import { BUSINESS_TYPE_LABELS } from '../../../constants/labels';
import { COUNTRY } from '../../../constants/locations';
import { useTheme, type Theme } from '../../../../theme';
import { errorMessage } from '../../../../utils/errorMessage';
import { useDealerApplication, useSaveDealerApplication } from '../../hooks/application';
import type { BusinessType } from '../../types/application';
import { ChoiceGroup } from '../ChoiceGroup';
import { FormErrorSummary } from '../FormErrorSummary';
import { FormSkeleton, StepActions, StepLoadFailure } from './StepParts';

const BUSINESS_TYPES = Object.keys(BUSINESS_TYPE_LABELS) as BusinessType[];

// The lengths match the database checks on dealer_profiles (20261012080000_applications.sql).
function makeSchema() {
  const text = (min: number, max: number, message: string) => z.string().trim().min(min, message).max(max, message);
  return z.object({
    businessName: text(2, 120, 'Enter the name of your business'),
    businessType: z.enum(BUSINESS_TYPES as [BusinessType, ...BusinessType[]]),
    registrationNumber: text(2, 60, 'Enter the registration or licence number'),
    businessAddress: text(5, 300, 'Enter the street address of your business'),
    province: z.string().trim().min(2, 'Choose the province of your business'),
    city: z.string().trim().min(2, 'Enter the city of your business'),
  });
}

type Values = z.infer<ReturnType<typeof makeSchema>>;

/** The dealer's business details (SRDS §7): the second step of their application, and the dealer's profile form. */
export function DealerBusinessStep({
  onDone,
  onBack,
  submitLabel = 'Save and continue',
}: {
  onDone: () => void;
  /** Present when another step comes before this one. */
  onBack?: () => void;
  submitLabel?: string;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const saved = useDealerApplication();
  const save = useSaveDealerApplication();
  const schema = useMemo(() => makeSchema(), []);
  const {
    control,
    handleSubmit,
    reset,
    setFocus,
    setValue,
    watch,
    formState: { errors, submitCount },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      businessName: '',
      businessType: 'agri_input_retailer',
      registrationNumber: '',
      businessAddress: '',
      province: '',
      city: '',
    },
  });

  // Fill the form once from what was saved before (a rejected dealer correcting it); later refetches keep the edits.
  const filled = useRef(false);
  const application = saved.data;
  useEffect(() => {
    if (!application || filled.current) return;
    filled.current = true;
    reset({
      businessName: application.business_name,
      businessType: application.business_type,
      registrationNumber: application.registration_number,
      businessAddress: application.business_address,
      province: application.province,
      city: application.city,
    });
  }, [application, reset]);

  const onSubmit = async (values: Values) => {
    // A refusal (application_locked, say) is shown from the mutation's own error; the step stays open.
    const input = {
      business_name: values.businessName,
      business_type: values.businessType,
      registration_number: values.registrationNumber,
      business_address: values.businessAddress,
      // ZaraiLink serves Pakistan only, so the country is not asked.
      country: COUNTRY,
      province: values.province,
      city: values.city,
    };
    const stored = await save.mutateAsync(input).then(() => true, () => false);
    if (stored) onDone();
  };

  if (saved.isPending) return <FormSkeleton />;
  // A failed load must not look like an empty form: saving over it would replace what the dealer already sent.
  if (saved.isError) return <StepLoadFailure error={saved.error} onRetry={() => saved.refetch()} />;

  const businessType = watch('businessType');
  return (
    <View style={styles.form}>
      <View>
        <Controller
          control={control}
          name="businessName"
          render={({ field: { ref, onChange, onBlur, value } }) => (
            <TextField
              ref={ref}
              label="Business name"
              returnKeyType="next"
              onSubmitEditing={() => setFocus('registrationNumber')}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.businessName?.message}
            />
          )}
        />
        <ChoiceGroup label="Business type" single error={errors.businessType?.message}>
          {BUSINESS_TYPES.map(type => (
            <Chip
              key={type}
              label={BUSINESS_TYPE_LABELS[type]}
              selected={businessType === type}
              onPress={() => setValue('businessType', type)}
            />
          ))}
        </ChoiceGroup>
        <Controller
          control={control}
          name="registrationNumber"
          render={({ field: { ref, onChange, onBlur, value } }) => (
            <TextField
              ref={ref}
              label="Registration or licence number"
              helper="As it appears on your business registration certificate"
              autoCapitalize="characters"
              returnKeyType="next"
              onSubmitEditing={() => setFocus('businessAddress')}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.registrationNumber?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="businessAddress"
          render={({ field: { ref, onChange, onBlur, value } }) => (
            <TextField
              ref={ref}
              label="Business address"
              autoComplete="street-address"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.businessAddress?.message}
            />
          )}
        />
        <LocationPicker
          province={watch('province') || null}
          city={watch('city') || null}
          onProvinceChange={value => setValue('province', value ?? '', { shouldValidate: submitCount > 0 })}
          onCityChange={value => setValue('city', value ?? '', { shouldValidate: submitCount > 0 })}
          errors={{ province: errors.province?.message, city: errors.city?.message }}
        />
      </View>
      <FormErrorSummary errors={errors} submitted={submitCount > 0} />
      {save.error ? <Banner tone="danger">{errorMessage(save.error)}</Banner> : null}
      <StepActions onBack={onBack} primaryLabel={submitLabel} loading={save.isPending} onPrimary={handleSubmit(onSubmit)} />
    </View>
  );
}

function makeStyles({ space }: Theme) {
  return StyleSheet.create({
    form: { gap: space[4] },
  });
}
