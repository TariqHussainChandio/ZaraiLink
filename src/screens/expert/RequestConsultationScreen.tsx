import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { launchImageLibrary, type Asset } from 'react-native-image-picker';
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { z } from 'zod';
import { Button, Input, SelectField } from '../../components/ui';
import { fetchFarms } from '../../services/modules/farmer/farmService';
import {
  createConsultationRequest,
  updateConsultationImages,
  uploadConsultationAttachments,
} from '../../services/modules/expert/consultationService';
import { useAuthStore } from '../../store/authStore';
import { useMarketplaceStore } from '../../store/marketplaceStore';
import { useTheme, type Theme } from '../../theme';
import type { ConsultationPriority } from '../../types/expert';
import type { Farm } from '../../types/farmer';
import type { ConsultationsScreenProps } from '../../navigation/stacks/ConsultationsNavigator';

const PRIORITY_OPTIONS: { id: ConsultationPriority; label: string }[] = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
];

const requestSchema = z.object({
  subject: z.string().min(3, 'Enter a subject'),
  cropId: z.string().nullable(),
  problemDescription: z.string(),
  farmId: z.string().nullable(),
  priority: z.enum(['low', 'medium', 'high']),
});

type RequestFormValues = z.infer<typeof requestSchema>;

export function RequestConsultationScreen({ route, navigation }: ConsultationsScreenProps<'RequestConsultation'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { expertId, prefill } = route.params;
  const userId = useAuthStore(state => state.user?.id);
  const crops = useMarketplaceStore(state => state.crops);
  const loadCrops = useMarketplaceStore(state => state.loadCrops);
  const [farms, setFarms] = useState<Farm[]>([]);
  // A disease-advisory handoff seeds this with the case's already-uploaded remote image —
  // `uploadConsultationAttachments` just does `fetch(image.uri)`, which works the same for a
  // remote `https://` URL as for a local picker `file://` URI, so no service changes needed.
  const [images, setImages] = useState<Asset[]>(
    prefill?.imageUrl ? [{ uri: prefill.imageUrl, fileName: 'disease-photo.jpg', type: 'image/jpeg' }] : [],
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadCrops();
    if (userId) fetchFarms().then(setFarms).catch(err => {
      console.warn('[RequestConsultationScreen] failed to load farms:', err);
    });
  }, [userId, loadCrops]);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RequestFormValues>({
    resolver: zodResolver(requestSchema),
    defaultValues: {
      subject: prefill?.subject ?? '',
      cropId: prefill?.cropId ?? null,
      problemDescription: prefill?.problemDescription ?? '',
      farmId: null,
      priority: 'medium',
    },
  });

  const pickImages = async () => {
    const result = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 4 });
    if (result.assets) setImages(result.assets);
  };

  const onSubmit = async (values: RequestFormValues) => {
    if (!userId) return;
    setSubmitting(true);
    try {
      const consultation = await createConsultationRequest({
        expertId,
        subject: values.subject,
        cropId: values.cropId,
        problemDescription: values.problemDescription,
        farmId: values.farmId,
        images: [],
        priority: values.priority,
      });

      if (images.length > 0) {
        const paths = await uploadConsultationAttachments(consultation.id, userId, images);
        await updateConsultationImages(consultation.id, paths);
      }

      navigation.goBack();
    } catch (error) {
      Alert.alert('Could not send request', error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Controller
        control={control}
        name="subject"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input label="Subject" value={value} onChangeText={onChange} onBlur={onBlur} error={errors.subject?.message} />
        )}
      />

      <Controller
        control={control}
        name="cropId"
        render={({ field: { onChange, value } }) => (
          <SelectField
            label="Crop (optional)"
            value={value}
            options={crops.map(c => ({ id: c.id, label: c.name }))}
            onSelect={onChange}
          />
        )}
      />

      {farms.length > 0 ? (
        <Controller
          control={control}
          name="farmId"
          render={({ field: { onChange, value } }) => (
            <SelectField
              label="Farm (optional)"
              value={value}
              options={farms.map(f => ({ id: f.id, label: f.name }))}
              onSelect={onChange}
            />
          )}
        />
      ) : null}

      <Controller
        control={control}
        name="problemDescription"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            label="Describe the problem"
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
        name="priority"
        render={({ field: { onChange, value } }) => (
          <SelectField label="Priority" value={value} options={PRIORITY_OPTIONS} onSelect={onChange} searchable={false} />
        )}
      />

      <Text style={styles.label}>Photos (optional)</Text>
      <View style={styles.imageRow}>
        {images.map(image => (
          <Image key={image.uri} source={{ uri: image.uri }} style={styles.thumb} />
        ))}
        <TouchableOpacity style={styles.addImage} onPress={pickImages}>
          <Text style={styles.addImageLabel}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <Button label="Send Request" loading={submitting} onPress={handleSubmit(onSubmit)} style={styles.submit} />
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
    imageRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    thumb: {
      width: 64,
      height: 64,
      borderRadius: radii.md,
      backgroundColor: colors.border,
    },
    addImage: {
      width: 64,
      height: 64,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
    },
    addImageLabel: {
      fontSize: typography.sizes.xs,
      color: colors.text.secondary,
    },
    submit: {
      marginTop: spacing.md,
      marginBottom: spacing['2xl'],
    },
  });
}
