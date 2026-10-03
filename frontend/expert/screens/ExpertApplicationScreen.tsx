import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { z } from 'zod';
import { Button, Chip, EmptyState, TextField, LocationPicker, Spinner } from '../../common/components';
import { useOwnExpertProfile, useSaveExpertProfile } from '../hooks/experts';
import { useAuthStore } from '../../state/authStore';
import { useTheme, type Theme } from '../../theme';
import type { ExpertSpecialization } from '../types/expert';
import { pickPhotos, type PickedPhoto } from '../../utils/photoPicker';
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
    country: z.string().nullable(),
    province: z.string().nullable(),
    city: z.string().nullable(),
  });
}

type ApplicationFormValues = z.infer<ReturnType<typeof buildApplicationSchema>>;

export function ExpertApplicationScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const { data: ownProfile, isLoading: loading, error, refetch } = useOwnExpertProfile(!!userId);
  const saveProfile = useSaveExpertProfile(userId);
  const [isEditing, setIsEditing] = useState(false);
  const [specializations, setSpecializations] = useState<ExpertSpecialization[]>([]);
  const [document, setDocument] = useState<PickedPhoto | null>(null);
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
    setIsEditing(true);
    setSpecializations(ownProfile.expert_specializations.map(s => s.specialization));
    reset({
      qualifications: ownProfile.qualifications ?? '',
      degree: ownProfile.degree ?? '',
      experience: ownProfile.experience ?? '',
      professionalDescription: ownProfile.professional_description ?? '',
      contact: ownProfile.contact ?? '',
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

  const pickDocument = async () => {
    // No document-picker dependency exists in this project — a photo of the certificate is the
    // deliberate, buildable choice here rather than adding a new native dependency.
    // `pickPhotos` offers camera-or-gallery, so an applicant can photograph a physical
    // certificate directly instead of needing an existing gallery photo of it.
    const assets = await pickPhotos({ selectionLimit: 1 });
    if (assets[0]) setDocument(assets[0]);
  };

  const onSubmit = async (values: ApplicationFormValues) => {
    if (!userId) return;
    if (specializations.length === 0) {
      Alert.alert('Select at least one specialization');
      return;
    }
    try {
      const input = { ...values, specializations };
      await saveProfile.mutateAsync({ input, isEditing, document });
      setIsEditing(true);
      Alert.alert(
        isEditing
          ? 'Profile updated'
          : 'Application submitted',
        'An admin will review your application.',
      );
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

      {!isEditing ? (
        <>
          <Text style={styles.label}>Qualification Document (optional)</Text>
          {document ? (
            <Image source={{ uri: document.uri }} style={styles.documentPreview} />
          ) : (
            <TouchableOpacity style={styles.documentPicker} onPress={pickDocument} accessibilityRole="button">
              <Text style={styles.documentPickerLabel}>+ Add a photo of your certificate</Text>
            </TouchableOpacity>
          )}
        </>
      ) : null}

      <Button
        label={
          isEditing
            ? 'Save Changes'
            : 'Submit Application'
        }
        loading={saveProfile.isPending}
        onPress={handleSubmit(onSubmit)}
        style={styles.submit}
      />
    </ScrollView>
  );
}

function makeStyles({ colors, space, radius, typography, size, borders }: Theme) {
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
    documentPreview: {
      width: size.photoLg,
      height: size.photoLg,
      borderRadius: radius.sm,
      marginBottom: space[3],
      backgroundColor: colors.line,
    },
    documentPicker: {
      height: size.photoMd,
      borderRadius: radius.sm,
      borderWidth: borders.hairline,
      borderColor: colors.line,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: space[3],
    },
    documentPickerLabel: {
      ...typography.caption,
      color: colors.ink2,
    },
    submit: {
      marginTop: space[3],
      marginBottom: space[8],
    },
  });
}
