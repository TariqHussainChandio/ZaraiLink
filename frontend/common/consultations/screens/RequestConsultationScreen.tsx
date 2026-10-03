import { zodResolver } from '@hookform/resolvers/zod';
import React, { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { z } from 'zod';
import { Button, TextField, SelectField } from '../../components';
import { useRequestConsultation } from '../hooks/consultations';
import { useAuthStore } from '../../../state/authStore';
import { useFarms } from '../../../farmer';
import { useCrops } from '../../marketplace';
import { useTheme, type Theme } from '../../../theme';
import type { ConsultationPriority } from '../../../expert';
import { pickFromLibrary, type PickedPhoto } from '../../../utils/photoPicker';
import type { ConsultationsScreenProps } from '../../../navigation/stacks/ConsultationsNavigator';
import { errorMessage } from '../../../utils/errorMessage';

const PRIORITY_IDS: ConsultationPriority[] = ['low', 'medium', 'high'];

const PRIORITY_LABELS: Record<ConsultationPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};
const PRIORITY_OPTIONS = PRIORITY_IDS.map(id => ({ id, label: PRIORITY_LABELS[id] }));

function buildRequestSchema() {
  return z.object({
    subject: z.string().min(3, 'Enter a subject'),
    cropId: z.string().nullable(),
    problemDescription: z.string(),
    farmId: z.string().nullable(),
    priority: z.enum(['low', 'medium', 'high']),
  });
}

type RequestFormValues = z.infer<ReturnType<typeof buildRequestSchema>>;

export function RequestConsultationScreen({ route, navigation }: ConsultationsScreenProps<'RequestConsultation'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { expertId, prefill } = route.params;
  const userId = useAuthStore(state => state.user?.id);
  const { data: crops = [] } = useCrops();
  const { data: farms = [] } = useFarms(!!userId);
  // A disease-advisory handoff seeds this with the case's already-uploaded remote image —
  // `uploadConsultationAttachments` just does `fetch(image.uri)`, which works the same for a
  // remote `https://` URL as for a local picker `file://` URI, so no service changes needed.
  const [images, setImages] = useState<PickedPhoto[]>(
    prefill?.imageUrl ? [{ uri: prefill.imageUrl, fileName: 'disease-photo.jpg', mimeType: 'image/jpeg' }] : [],
  );
  const requestConsultation = useRequestConsultation(userId);

  const requestSchema = useMemo(() => buildRequestSchema(), []);

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
    const photos = await pickFromLibrary({ selectionLimit: 4 });
    // Backing out of the picker returns nothing; keep whatever was already chosen.
    if (photos.length > 0) setImages(photos);
  };

  const onSubmit = async (values: RequestFormValues) => {
    if (!userId) return;
    try {
      await requestConsultation.mutateAsync({
        input: {
          expertId,
          subject: values.subject,
          cropId: values.cropId,
          problemDescription: values.problemDescription,
          farmId: values.farmId,
          images: [],
          priority: values.priority,
        },
        images,
      });
      navigation.goBack();
    } catch (error) {
      Alert.alert('Could not send request', errorMessage(error));
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Controller
        control={control}
        name="subject"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Subject"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.subject?.message}
          />
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
          <TextField
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
          <SelectField
            label="Priority"
            value={value}
            options={PRIORITY_OPTIONS}
            onSelect={onChange}
            searchable={false}
          />
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

      <Button
        label="Send Request"
        loading={requestConsultation.isPending}
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
    imageRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space[2],
      marginBottom: space[3],
    },
    thumb: {
      width: size.photoSm,
      height: size.photoSm,
      borderRadius: radius.sm,
      backgroundColor: colors.line,
    },
    addImage: {
      width: size.photoSm,
      height: size.photoSm,
      borderRadius: radius.sm,
      borderWidth: borders.hairline,
      borderColor: colors.line,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
    },
    addImageLabel: {
      ...typography.caption,
      color: colors.ink2,
    },
    submit: {
      marginTop: space[3],
      marginBottom: space[8],
    },
  });
}
