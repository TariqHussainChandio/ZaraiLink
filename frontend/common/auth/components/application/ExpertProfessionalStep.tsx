import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';
import { Banner, Button, Chip, LocationPicker, Spinner, TextField } from '../../../components';
import { SPECIALIZATION_LABELS } from '../../../constants/labels';
import { useOwnExpertProfile, useSaveExpertProfile, type ExpertSpecialization } from '../../../../expert';
import { useTheme, type Theme } from '../../../../theme';
import { errorMessage } from '../../../../utils/errorMessage';

const SPECIALIZATIONS = Object.keys(SPECIALIZATION_LABELS) as ExpertSpecialization[];

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
    country: z.string().nullable(),
    province: z.string().nullable(),
    city: z.string().nullable(),
  });
}

type Values = z.infer<ReturnType<typeof makeSchema>>;

/** The expert's professional details (SRDS §10): the second step of their application. */
export function ExpertProfessionalStep({ onDone }: { onDone: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { data: saved, isLoading } = useOwnExpertProfile(true);
  const save = useSaveExpertProfile();
  const [specializations, setSpecializations] = useState<ExpertSpecialization[]>([]);
  const [specializationError, setSpecializationError] = useState(false);
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
      qualifications: '',
      degree: '',
      experience: '',
      yearsExperience: '',
      institutionAffiliation: '',
      professionalDescription: '',
      contact: '',
      country: null,
      province: null,
      city: null,
    },
  });

  const filled = useRef(false);
  useEffect(() => {
    if (!saved || filled.current) return;
    filled.current = true;
    setSpecializations(saved.expert_specializations.map(s => s.specialization));
    reset({
      qualifications: saved.qualifications ?? '',
      degree: saved.degree ?? '',
      experience: saved.experience ?? '',
      yearsExperience: saved.years_experience === null ? '' : String(saved.years_experience),
      institutionAffiliation: saved.institution_affiliation ?? '',
      professionalDescription: saved.professional_description ?? '',
      contact: saved.contact ?? '',
      country: saved.location?.country ?? null,
      province: saved.location?.province ?? null,
      city: saved.location?.city ?? null,
    });
  }, [saved, reset]);

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
    const { yearsExperience, institutionAffiliation, ...rest } = values;
    // A refusal is shown from the mutation's own error; the step stays open.
    const input = { ...rest, specializations, yearsExperience: Number(yearsExperience), institutionAffiliation };
    const stored = await save.mutateAsync({ input, exists: !!saved }).then(() => true, () => false);
    if (stored) onDone();
  };

  if (isLoading) return <Spinner />;

  const field = (name: keyof Values, label: string, extra: Partial<React.ComponentProps<typeof TextField>> = {}) => (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, onBlur, value } }) => (
        <TextField
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
      {field('qualifications', 'Qualifications', { placeholder: 'e.g. MSc Plant Pathology' })}
      {field('degree', 'Highest degree or certification')}
      {field('yearsExperience', 'Years of experience', { keyboardType: 'number-pad' })}
      {field('institutionAffiliation', 'Institution affiliation', { placeholder: 'University, research institute or department' })}
      {field('experience', 'Professional experience', { optional: true, multiline: true })}
      {field('professionalDescription', 'About you', { optional: true, multiline: true, numberOfLines: 4 })}
      {field('contact', 'Contact for clients', { optional: true, keyboardType: 'phone-pad' })}
      <LocationPicker
        country={watch('country')}
        province={watch('province')}
        city={watch('city')}
        onCountryChange={value => setValue('country', value)}
        onProvinceChange={value => setValue('province', value)}
        onCityChange={value => setValue('city', value)}
      />
      <Text style={styles.label}>Specializations</Text>
      <View style={styles.chips}>
        {SPECIALIZATIONS.map(id => (
          <Chip key={id} label={SPECIALIZATION_LABELS[id]} selected={specializations.includes(id)} onPress={() => toggle(id)} />
        ))}
      </View>
      {specializationError ? <Text style={styles.error}>Choose at least one specialization</Text> : null}
      {save.error ? <Banner tone="danger">{errorMessage(save.error)}</Banner> : null}
      <Button label="Save and continue" loading={save.isPending} onPress={handleSubmit(onSubmit)} />
    </View>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    form: { gap: space[2] },
    label: { ...typography.caption, color: colors.ink2 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
    error: { ...typography.caption, color: colors.status.danger.mark },
  });
}
