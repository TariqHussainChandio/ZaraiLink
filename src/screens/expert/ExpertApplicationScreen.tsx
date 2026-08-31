import { zodResolver } from '@hookform/resolvers/zod';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type { Asset } from 'react-native-image-picker';
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { z } from 'zod';
import { Button, EmptyState, Input, LocationPicker, Spinner } from '../../components/ui';
import {
  fetchExpertProfile,
  submitExpertApplication,
  updateExpertProfile,
  uploadExpertDocument,
} from '../../services/modules/expert/expertService';
import { useAuthStore } from '../../store/authStore';
import { useTheme, type Theme } from '../../theme';
import type { ExpertSpecialization } from '../../types/expert';
import { pickPhotos } from '../../utils/photoPicker';

const SPECIALIZATION_OPTIONS: { id: ExpertSpecialization; label: string }[] = [
  { id: 'crop_management', label: 'Crop Management' },
  { id: 'plant_diseases', label: 'Plant Diseases' },
  { id: 'pest_management', label: 'Pest Management' },
  { id: 'fertilizer_management', label: 'Fertilizer Management' },
  { id: 'irrigation', label: 'Irrigation' },
  { id: 'soil_management', label: 'Soil Management' },
  { id: 'crop_nutrition', label: 'Crop Nutrition' },
  { id: 'general_agriculture', label: 'General Agriculture' },
];

const applicationSchema = z.object({
  qualifications: z.string().min(2, 'Enter your qualifications'),
  degree: z.string(),
  experience: z.string(),
  professionalDescription: z.string(),
  contact: z.string(),
  country: z.string().nullable(),
  province: z.string().nullable(),
  city: z.string().nullable(),
});

type ApplicationFormValues = z.infer<typeof applicationSchema>;

export function ExpertApplicationScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [specializations, setSpecializations] = useState<ExpertSpecialization[]>([]);
  const [document, setDocument] = useState<Asset | null>(null);

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

  const load = useCallback(() => {
    if (!userId) return;
    setLoading(true);
    setError(false);
    fetchExpertProfile()
      .then(profile => {
        if (profile) {
          setIsEditing(true);
          setSpecializations(profile.expert_specializations.map(s => s.specialization));
          reset({
            qualifications: profile.qualifications ?? '',
            degree: profile.degree ?? '',
            experience: profile.experience ?? '',
            professionalDescription: profile.professional_description ?? '',
            contact: profile.contact ?? '',
            country: profile.location?.country ?? null,
            province: profile.location?.province ?? null,
            city: profile.location?.city ?? null,
          });
        }
      })
      .catch(err => {
        console.warn('[ExpertApplicationScreen] failed to load expert profile:', err);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [userId, reset]);

  useEffect(() => {
    load();
  }, [load]);

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
    setSubmitting(true);
    try {
      const input = { ...values, specializations };
      if (isEditing) {
        await updateExpertProfile(input);
      } else {
        const documentPath = document ? await uploadExpertDocument(userId, document) : null;
        await submitExpertApplication(input, documentPath);
        setIsEditing(true);
      }
      Alert.alert(isEditing ? 'Profile updated' : 'Application submitted', 'An admin will review your application.');
    } catch (err) {
      Alert.alert('Could not save', err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Spinner fullscreen />;
  if (error) {
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
          <Input
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
          <Input label="Degree / Certification" value={value} onChangeText={onChange} onBlur={onBlur} />
        )}
      />
      <Controller
        control={control}
        name="experience"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input label="Experience" value={value} onChangeText={onChange} onBlur={onBlur} />
        )}
      />
      <Controller
        control={control}
        name="professionalDescription"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
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
          <Input label="Contact" value={value} onChangeText={onChange} onBlur={onBlur} keyboardType="phone-pad" />
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
          return (
            <TouchableOpacity
              key={option.id}
              onPress={() => toggleSpecialization(option.id)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {!isEditing ? (
        <>
          <Text style={styles.label}>Qualification Document (optional)</Text>
          {document ? (
            <Image source={{ uri: document.uri }} style={styles.documentPreview} />
          ) : (
            <TouchableOpacity style={styles.documentPicker} onPress={pickDocument}>
              <Text style={styles.documentPickerLabel}>+ Add a photo of your certificate</Text>
            </TouchableOpacity>
          )}
        </>
      ) : null}

      <Button
        label={isEditing ? 'Save Changes' : 'Submit Application'}
        loading={submitting}
        onPress={handleSubmit(onSubmit)}
        style={styles.submit}
      />
    </ScrollView>
  );
}

function makeStyles({ colors, spacing, radii, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.surface,
    },
    content: {
      padding: spacing.lg,
    },
    label: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.medium as any,
      color: colors.text.secondary,
      marginBottom: spacing.sm,
    },
    chipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    chip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 2,
      borderRadius: radii.full,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipSelected: {
      backgroundColor: colors.brand.primaryTint,
      borderColor: colors.brand.primary,
    },
    chipLabel: {
      fontSize: typography.sizes.xs,
      color: colors.text.secondary,
    },
    chipLabelSelected: {
      color: colors.brand.primary,
      fontWeight: typography.weights.semibold as any,
    },
    documentPreview: {
      width: 120,
      height: 120,
      borderRadius: radii.md,
      marginBottom: spacing.md,
      backgroundColor: colors.border,
    },
    documentPicker: {
      height: 80,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    documentPickerLabel: {
      fontSize: typography.sizes.sm,
      color: colors.text.secondary,
    },
    submit: {
      marginTop: spacing.md,
      marginBottom: spacing['2xl'],
    },
  });
}
