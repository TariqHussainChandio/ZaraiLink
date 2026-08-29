import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { launchImageLibrary, type Asset } from 'react-native-image-picker';
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { z } from 'zod';
import { Button, Input, LocationPicker, Spinner } from '../../components/ui';
import {
  fetchExpertProfile,
  submitExpertApplication,
  updateExpertProfile,
  uploadExpertDocument,
} from '../../services/modules/expert/expertService';
import { useAuthStore } from '../../store/authStore';
import { lightTheme } from '../../theme';
import type { ExpertSpecialization } from '../../types/expert';

const { colors, spacing, radii, typography } = lightTheme;

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
  countryId: z.string().nullable(),
  provinceId: z.string().nullable(),
  cityId: z.string().nullable(),
});

type ApplicationFormValues = z.infer<typeof applicationSchema>;

export function ExpertApplicationScreen() {
  const userId = useAuthStore(state => state.user?.id);
  const [loading, setLoading] = useState(true);
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
      countryId: null,
      provinceId: null,
      cityId: null,
    },
  });

  useEffect(() => {
    if (!userId) return;
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
            countryId: profile.location?.country_id ?? null,
            provinceId: profile.location?.province_id ?? null,
            cityId: profile.location?.city_id ?? null,
          });
        }
      })
      .catch(err => {
        console.warn('[ExpertApplicationScreen] failed to load expert profile:', err);
      })
      .finally(() => setLoading(false));
  }, [userId, reset]);

  const toggleSpecialization = (specialization: ExpertSpecialization) => {
    setSpecializations(current =>
      current.includes(specialization) ? current.filter(s => s !== specialization) : [...current, specialization],
    );
  };

  const pickDocument = async () => {
    // No document-picker dependency exists in this project — a photo of the certificate
    // (the same `launchImageLibrary` pattern used everywhere else in this app) is the
    // deliberate, buildable choice here rather than adding a new native dependency.
    const result = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1 });
    if (result.assets?.[0]) setDocument(result.assets[0]);
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
    } catch (error) {
      Alert.alert('Could not save', error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Spinner fullscreen />;

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
        countryId={watch('countryId')}
        provinceId={watch('provinceId')}
        cityId={watch('cityId')}
        onCountryChange={id => setValue('countryId', id)}
        onProvinceChange={id => setValue('provinceId', id)}
        onCityChange={id => setValue('cityId', id)}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
  },
  content: {
    padding: spacing.lg,
  },
  label: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium as any,
    color: colors.neutral.gray700,
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
    borderColor: colors.neutral.gray300,
  },
  chipSelected: {
    backgroundColor: colors.brand.primaryTint,
    borderColor: colors.brand.primary,
  },
  chipLabel: {
    fontSize: typography.sizes.xs,
    color: colors.neutral.gray700,
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
    backgroundColor: colors.neutral.gray100,
  },
  documentPicker: {
    height: 80,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.neutral.gray300,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  documentPickerLabel: {
    fontSize: typography.sizes.sm,
    color: colors.neutral.gray500,
  },
  submit: {
    marginTop: spacing.md,
    marginBottom: spacing['2xl'],
  },
});
