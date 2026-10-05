import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect, useMemo, useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';
import { Banner, Button, type ChipOption, ChipRow, LocationPicker, Spinner, TextField } from '../../../components';
import { BUSINESS_TYPE_LABELS } from '../../../constants/labels';
import { useTheme, type Theme } from '../../../../theme';
import { errorMessage } from '../../../../utils/errorMessage';
import { useDealerApplication, useSaveDealerApplication } from '../../hooks/application';
import type { BusinessType } from '../../types/application';

const BUSINESS_TYPES = Object.keys(BUSINESS_TYPE_LABELS) as BusinessType[];
const TYPE_OPTIONS: ChipOption<BusinessType>[] = BUSINESS_TYPES.map(value => ({ value, label: BUSINESS_TYPE_LABELS[value] }));

// The lengths match the database checks on dealer_profiles (20261012080000_applications.sql).
function makeSchema() {
  const text = (min: number, max: number, message: string) => z.string().trim().min(min, message).max(max, message);
  return z.object({
    businessName: text(2, 120, 'Enter the name of your business'),
    businessType: z.enum(BUSINESS_TYPES as [BusinessType, ...BusinessType[]]),
    registrationNumber: text(2, 60, 'Enter the registration or licence number'),
    businessAddress: text(5, 300, 'Enter the street address of your business'),
    country: z.string().trim().min(2, 'Enter the country'),
    province: z.string().trim().min(2, 'Enter the province'),
    city: z.string().trim().min(2, 'Enter the city'),
  });
}

type Values = z.infer<ReturnType<typeof makeSchema>>;

/** The dealer's business details (SRDS §7): the second step of their application, and the dealer's profile form. */
export function DealerBusinessStep({
  onDone,
  submitLabel = 'Save and continue',
}: {
  onDone: () => void;
  submitLabel?: string;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { data: saved, isLoading } = useDealerApplication();
  const save = useSaveDealerApplication();
  const schema = useMemo(() => makeSchema(), []);
  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      businessName: '',
      businessType: 'agri_input_retailer',
      registrationNumber: '',
      businessAddress: '',
      country: '',
      province: '',
      city: '',
    },
  });

  // Fill the form once from what was saved before (a rejected dealer correcting it); later refetches keep the edits.
  const filled = useRef(false);
  useEffect(() => {
    if (!saved || filled.current) return;
    filled.current = true;
    reset({
      businessName: saved.business_name,
      businessType: saved.business_type,
      registrationNumber: saved.registration_number,
      businessAddress: saved.business_address,
      country: saved.country,
      province: saved.province,
      city: saved.city,
    });
  }, [saved, reset]);

  const onSubmit = async (values: Values) => {
    // A refusal (application_locked, say) is shown from the mutation's own error; the step stays open.
    const input = {
      business_name: values.businessName,
      business_type: values.businessType,
      registration_number: values.registrationNumber,
      business_address: values.businessAddress,
      country: values.country,
      province: values.province,
      city: values.city,
    };
    const stored = await save.mutateAsync(input).then(() => true, () => false);
    if (stored) onDone();
  };

  if (isLoading) return <Spinner />;

  return (
    <View style={styles.form}>
      <Controller
        control={control}
        name="businessName"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField label="Business name" value={value} onChangeText={onChange} onBlur={onBlur} error={errors.businessName?.message} />
        )}
      />
      <Text style={styles.label}>Business type</Text>
      <Controller
        control={control}
        name="businessType"
        render={({ field: { onChange, value } }) => <ChipRow options={TYPE_OPTIONS} value={value} onChange={onChange} />}
      />
      <Controller
        control={control}
        name="registrationNumber"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Registration or licence number"
            helper="As it appears on your business registration certificate"
            autoCapitalize="characters"
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
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField label="Business address" value={value} onChangeText={onChange} onBlur={onBlur} error={errors.businessAddress?.message} />
        )}
      />
      <LocationPicker
        country={watch('country') || null}
        province={watch('province') || null}
        city={watch('city') || null}
        onCountryChange={value => setValue('country', value ?? '', { shouldValidate: !!errors.country })}
        onProvinceChange={value => setValue('province', value ?? '', { shouldValidate: !!errors.province })}
        onCityChange={value => setValue('city', value ?? '', { shouldValidate: !!errors.city })}
      />
      {errors.country || errors.province || errors.city ? (
        <Text style={styles.error}>Enter the country, province and city of your business</Text>
      ) : null}
      {save.error ? <Banner tone="danger">{errorMessage(save.error)}</Banner> : null}
      <Button label={submitLabel} loading={save.isPending} onPress={handleSubmit(onSubmit)} />
    </View>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    form: { gap: space[2] },
    label: { ...typography.caption, color: colors.ink2 },
    error: { ...typography.caption, color: colors.status.danger.mark },
  });
}
