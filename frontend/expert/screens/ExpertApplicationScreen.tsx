import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';
import { Button, Chip, EmptyState, TextField, LocationPicker, Spinner } from '../../common/components';
import { useOwnExpertProfile, useSaveExpertProfile } from '../hooks/experts';
import { useAuthStore } from '../../state/authStore';
import { useTheme, type Theme } from '../../theme';
import type { ExpertSpecialization } from '../types/expert';
import { errorMessage } from '../../utils/errorMessage';
import { SPECIALIZATION_LABELS } from '../../common/constants/labels';

const SPECIALIZATION_IDS: ExpertSpecialization[] = [
  'crop_management',
  'plant_diseases',
  'pest_management',
  'fertilizer_management',
  'irrigation',
  'soil_management',
  'crop_nutrition',
  'general_agriculture',
];
const SPECIALIZATION_OPTIONS = SPECIALIZATION_IDS.map(id => ({ id, label: SPECIALIZATION_LABELS[id] }));

function buildApplicationSchema() {
  return z.object({
    qualifications: z.string().min(2, 'Enter your qualifications'),
    degree: z.string(),
    experience: z.string(),
    professionalDescription: z.string(),
    contact: z.string(),
    yearsExperience: z
      .string()
      .trim()
      .regex(/^\d{0,2}$/, 'Enter a number of years'),
    institutionAffiliation: z.string().trim(),
    country: z.string().nullable(),
    province: z.string().nullable(),
    city: z.string().nullable(),
  });
}

type ApplicationFormValues = z.infer<ReturnType<typeof buildApplicationSchema>>;

/**
 * The expert's professional profile: what clients see in the directory. A pending expert fills it in as the first step
 * of their application (ApplicationWizardScreen, A3b); an approved expert keeps it current here.
 */
export function ExpertApplicationScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const { data: ownProfile, isLoading: loading, error, refetch } = useOwnExpertProfile(!!userId);
  const saveProfile = useSaveExpertProfile();
  const [specializations, setSpecializations] = useState<ExpertSpecialization[]>([]);
  const load = () => refetch();
  const applicationSchema = useMemo(() => buildApplicationSchema(), []);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ApplicationFormValues>({
    resolver: zodResolver(applicationSchema),
    defaultValues: {
      qualifications: '',
      degree: '',
      experience: '',
      professionalDescription: '',
      contact: '',
      yearsExperience: '',
      institutionAffiliation: '',
      country: null,
      province: null,
      city: null,
    },
  });

  // Fill the form once, from the first copy of the profile; a later background refetch must not overwrite edits.
  const filled = useRef(false);
  useEffect(() => {
    if (!ownProfile || filled.current) return;
    filled.current = true;
    setSpecializations(ownProfile.expert_specializations.map(s => s.specialization));
    reset({
      qualifications: ownProfile.qualifications ?? '',
      degree: ownProfile.degree ?? '',
      experience: ownProfile.experience ?? '',
      professionalDescription: ownProfile.professional_description ?? '',
      contact: ownProfile.contact ?? '',
      yearsExperience: ownProfile.years_experience === null ? '' : String(ownProfile.years_experience),
      institutionAffiliation: ownProfile.institution_affiliation ?? '',
      country: ownProfile.location?.country ?? null,
      province: ownProfile.location?.province ?? null,
      city: ownProfile.location?.city ?? null,
    });
  }, [ownProfile, reset]);

  const toggleSpecialization = (specialization: ExpertSpecialization) => {
    setSpecializations(current =>
      current.includes(specialization) ? current.filter(s => s !== specialization) : [...current, specialization],
    );
  };

  const onSubmit = async (values: ApplicationFormValues) => {
    if (!userId) return;
    if (specializations.length === 0) {
      Alert.alert('Select at least one specialization');
      return;
    }
    try {
      const { yearsExperience, institutionAffiliation, ...rest } = values;
      const input = {
        ...rest,
        specializations,
        yearsExperience: yearsExperience ? Number(yearsExperience) : undefined,
        institutionAffiliation: institutionAffiliation || undefined,
      };
      await saveProfile.mutateAsync({ input, exists: !!ownProfile });
      Alert.alert('Profile updated');
    } catch (err) {
      Alert.alert('Could not save', errorMessage(err));
    }
  };

  if (loading) return <Spinner fullscreen />;
  if (error && !ownProfile) {
    return (
      <EmptyState
        title="Couldn't load your application"
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
        name="qualifications"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Qualifications"
            placeholder="e.g. PhD Agronomy, 10 years extension work"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.qualifications?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="degree"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField label="Degree / Certification" value={value} onChangeText={onChange} onBlur={onBlur} />
        )}
      />
      <Controller
        control={control}
        name="experience"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField label="Experience" value={value} onChangeText={onChange} onBlur={onBlur} />
        )}
      />
      <Controller
        control={control}
        name="yearsExperience"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Years of experience"
            keyboardType="number-pad"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.yearsExperience?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="institutionAffiliation"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField label="Institution affiliation" value={value} onChangeText={onChange} onBlur={onBlur} />
        )}
      />
      <Controller
        control={control}
        name="professionalDescription"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="About you"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            multiline
            numberOfLines={4}
          />
        )}
      />
      <Controller
        control={control}
        name="contact"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Contact"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            keyboardType="phone-pad"
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

      <Text style={styles.label}>Specializations</Text>
      <View style={styles.chipsRow}>
        {SPECIALIZATION_OPTIONS.map(option => {
          const selected = specializations.includes(option.id);
          return <Chip key={option.id} label={option.label} selected={selected} onPress={() => toggleSpecialization(option.id)} />;
        })}
      </View>

      <Button
        label="Save changes"
        loading={saveProfile.isPending}
        onPress={handleSubmit(onSubmit)}
        style={styles.submit}
      />
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
    label: {
      ...typography.caption,
      color: colors.ink2,
      marginBottom: space[2],
    },
    chipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space[2],
      marginBottom: space[3],
    },
    submit: {
      marginTop: space[3],
      marginBottom: space[8],
    },
  });
}
