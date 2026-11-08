import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { z } from 'zod';
import { Banner, Chip, LocationPicker, TextField } from '../../../components';
import { SPECIALIZATION_LABELS } from '../../../constants/labels';
import { COUNTRY } from '../../../constants/locations';
import { useOwnExpertProfile, useSaveExpertProfile, type ExpertSpecialization } from '../../../../expert';
import { useTheme, type Theme } from '../../../../theme';
import { errorMessage } from '../../../../utils/errorMessage';
import { ChoiceGroup } from '../ChoiceGroup';
import { FormErrorSummary } from '../FormErrorSummary';
import { FormSkeleton, StepActions, StepLoadFailure } from './StepParts';

const SPECIALIZATIONS = Object.keys(SPECIALIZATION_LABELS) as ExpertSpecialization[];
const SPECIALIZATION_MESSAGE = 'Choose at least one specialization';

// What SRDS §10 asks of an expert; submit_application() requires the qualifications, the years, the institution and a
// specialization before an application reaches the queue.
function makeSchema() {
  return z.object({
    qualifications: z.string().trim().min(2, 'Enter your qualifications'),
    degree: z.string().trim().min(2, 'Enter your highest degree or certification'),
    experience: z.string().trim(),
    yearsExperience: z
      .string()
      .trim()
      .regex(/^\d{1,2}$/, 'Enter your years of experience as a number'),
    institutionAffiliation: z.string().trim().min(2, 'Enter the institution you are affiliated with').max(200),
    professionalDescription: z.string().trim(),
    contact: z.string().trim(),
    province: z.string().nullable(),
    city: z.string().nullable(),
  });
}

type Values = z.infer<ReturnType<typeof makeSchema>>;

/** The expert's professional details (SRDS §10): the second step of their application, and, once approved, the expert's
 * professional profile (the same form, so one set of labels and one set of rules). */
export function ExpertProfessionalStep({
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
  const saved = useOwnExpertProfile(true);
  const save = useSaveExpertProfile();
  const [specializations, setSpecializations] = useState<ExpertSpecialization[]>([]);
  const [specializationError, setSpecializationError] = useState(false);
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
      qualifications: '',
      degree: '',
      experience: '',
      yearsExperience: '',
      institutionAffiliation: '',
      professionalDescription: '',
      contact: '',
      province: null,
      city: null,
    },
  });

  const filled = useRef(false);
  const profile = saved.data;
  useEffect(() => {
    if (!profile || filled.current) return;
    filled.current = true;
    setSpecializations(profile.expert_specializations.map(s => s.specialization));
    reset({
      qualifications: profile.qualifications ?? '',
      degree: profile.degree ?? '',
      experience: profile.experience ?? '',
      yearsExperience: profile.years_experience === null ? '' : String(profile.years_experience),
      institutionAffiliation: profile.institution_affiliation ?? '',
      professionalDescription: profile.professional_description ?? '',
      contact: profile.contact ?? '',
      province: profile.location?.province ?? null,
      city: profile.location?.city ?? null,
    });
  }, [profile, reset]);

  const toggle = (specialization: ExpertSpecialization) => {
    setSpecializationError(false);
    setSpecializations(current =>
      current.includes(specialization) ? current.filter(s => s !== specialization) : [...current, specialization],
    );
  };

  const onSubmit = async (values: Values) => {
    if (specializations.length === 0) {
      setSpecializationError(true);
      return;
    }
    const { yearsExperience, institutionAffiliation, province, city, ...rest } = values;
    // A refusal is shown from the mutation's own error; the step stays open.
    const input = {
      ...rest,
      // The place is saved only when a province or city was given; the country is always Pakistan.
      country: province || city ? COUNTRY : null,
      province,
      city,
      specializations,
      yearsExperience: Number(yearsExperience),
      institutionAffiliation,
    };
    // `exists` is known: a failed load stopped the form below, so "no application yet" is never guessed from an error.
    const stored = await save.mutateAsync({ input, exists: !!profile }).then(() => true, () => false);
    if (stored) onDone();
  };

  if (saved.isPending) return <FormSkeleton />;
  if (saved.isError) return <StepLoadFailure error={saved.error} onRetry={() => saved.refetch()} />;

  const field = (name: keyof Values, label: string, extra: Partial<React.ComponentProps<typeof TextField>> = {}) => (
    <Controller
      control={control}
      name={name}
      render={({ field: { ref, onChange, onBlur, value } }) => (
        <TextField
          ref={ref}
          label={label}
          value={value ?? ''}
          onChangeText={onChange}
          onBlur={onBlur}
          error={errors[name]?.message}
          {...extra}
        />
      )}
    />
  );

  return (
    <View style={styles.form}>
      <View>
        {field('qualifications', 'Qualifications', {
          placeholder: 'e.g. MSc Plant Pathology',
          returnKeyType: 'next',
          onSubmitEditing: () => setFocus('degree'),
        })}
        {field('degree', 'Highest degree or certification', { returnKeyType: 'next', onSubmitEditing: () => setFocus('yearsExperience') })}
        {field('yearsExperience', 'Years of experience', {
          keyboardType: 'number-pad',
          returnKeyType: 'next',
          onSubmitEditing: () => setFocus('institutionAffiliation'),
        })}
        {field('institutionAffiliation', 'Institution affiliation', { placeholder: 'University, research institute or department' })}
        {field('experience', 'Professional experience', { optional: true, multiline: true })}
        {field('professionalDescription', 'About you', { optional: true, multiline: true, numberOfLines: 4 })}
        {field('contact', 'Contact for clients', { optional: true, keyboardType: 'phone-pad', autoComplete: 'tel' })}
        <LocationPicker
          province={watch('province')}
          city={watch('city')}
          onProvinceChange={value => setValue('province', value)}
          onCityChange={value => setValue('city', value)}
        />
        <ChoiceGroup label="Specializations" error={specializationError ? SPECIALIZATION_MESSAGE : undefined}>
          {SPECIALIZATIONS.map(id => (
            <Chip key={id} label={SPECIALIZATION_LABELS[id]} selected={specializations.includes(id)} onPress={() => toggle(id)} />
          ))}
        </ChoiceGroup>
      </View>
      <FormErrorSummary errors={errors} submitted={submitCount > 0} extra={[specializationError ? SPECIALIZATION_MESSAGE : undefined]} />
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
