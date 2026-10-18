import { zodResolver } from '@hookform/resolvers/zod';
import React, { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { z } from 'zod';
import { ImagePlus, ScanLine, Send } from 'lucide-react-native';
import {
  Banner,
  Button,
  ListGroup,
  ListRow,
  ListRowIcon,
  TextField,
  SelectField,
  useToast,
} from '../../components';
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
const PRIORITY_OPTIONS = PRIORITY_IDS.map(id => ({
  id,
  label: PRIORITY_LABELS[id],
}));

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

export function RequestConsultationScreen({
  route,
  navigation,
}: ConsultationsScreenProps<'RequestConsultation'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { expertId, prefill } = route.params;
  const userId = useAuthStore(state => state.user?.id);
  const { data: crops = [] } = useCrops();
  const { data: farms = [] } = useFarms(!!userId);
  // With a recorded case the expert already sees its photo through the case summary (RLS-checked), and the handoff's
  // link is a signed URL that expires after 10 minutes, so it is only previewed here, never fetched and re-uploaded.
  // Without a case (the scan failed before one was recorded) the photo is a local file and goes up as an attachment.
  const casePhotoUrl = prefill?.diseaseCaseId ? prefill.imageUrl : null;
  const [images, setImages] = useState<PickedPhoto[]>(
    !prefill?.diseaseCaseId && prefill?.imageUrl
      ? [
          {
            uri: prefill.imageUrl,
            fileName: 'disease-photo.jpg',
            mimeType: 'image/jpeg',
          },
        ]
      : [],
  );
  const requestConsultation = useRequestConsultation(userId);
  const toast = useToast();
  // A request that did not send stays on screen until the next try: the person must see it before going on.
  const [submitError, setSubmitError] = useState<string | null>(null);

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
      // Always the farmer's own words. A scan handoff's prefill may carry AI-written text; the AI report travels as
      // the linked disease case and is shown in its own card, so it is never mixed into this field (BR-13, SRDS §34-§36).
      problemDescription: '',
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
    setSubmitError(null);
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
          diseaseCaseId: prefill?.diseaseCaseId,
        },
        images,
      });
      toast.success('Request sent to the expert');
      navigation.goBack();
    } catch (error) {
      setSubmitError(errorMessage(error));
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {prefill?.diseaseCaseId ? (
        // The AI report goes with the request so the expert assesses the same case (SRDS §34); it stays advisory (BR-13).
        <View style={styles.attached}>
          <ListGroup>
            <ListRow
              title="AI report attached"
              meta="The expert will see the AI result and give their own assessment."
              leading={<ListRowIcon icon={ScanLine} />}
            />
          </ListGroup>
          {casePhotoUrl ? (
            <View style={styles.casePhotoRow}>
              <Image
                source={{ uri: casePhotoUrl }}
                style={styles.thumb}
                accessible
                accessibilityRole="image"
                accessibilityLabel="Photo from your scan"
              />
              <Text style={styles.casePhotoCaption}>
                Photo from your scan (attached with the AI report)
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

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

      <Text style={styles.label} accessibilityRole="header">
        Photos (optional)
      </Text>
      <View style={styles.imageRow}>
        {images.map((image, index) => (
          <Image
            key={image.uri}
            source={{ uri: image.uri }}
            style={styles.thumb}
            accessible
            accessibilityRole="image"
            accessibilityLabel={`Photo ${index + 1} of ${images.length}`}
          />
        ))}
        <Pressable
          style={({ pressed }) => [styles.addImage, pressed && styles.pressed]}
          onPress={pickImages}
          accessibilityRole="button"
          accessibilityLabel={
            images.length > 0 ? 'Change photos' : 'Add photos'
          }
          accessibilityHint="Opens your photo gallery, up to 4 photos"
        >
          <ImagePlus size={theme.size.iconMd} color={theme.colors.ink2} />
          <Text style={styles.addImageLabel}>Add</Text>
        </Pressable>
      </View>

      {submitError ? (
        <View style={styles.banner}>
          <Banner tone="danger" title="Could not send request">
            {submitError}
          </Banner>
        </View>
      ) : null}

      <Button
        label="Send Request"
        icon={Send}
        loading={requestConsultation.isPending}
        onPress={handleSubmit(onSubmit)}
        style={styles.submit}
      />
    </ScrollView>
  );
}

function makeStyles({
  colors,
  space,
  radius,
  typography,
  size,
  borders,
}: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    content: {
      padding: space[4],
    },
    attached: {
      marginBottom: space[3],
    },
    casePhotoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      marginTop: space[2],
    },
    casePhotoCaption: {
      ...typography.caption,
      color: colors.ink2,
      flex: 1,
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
      // At least the touch minimum, whatever the thumbnail size.
      minWidth: Math.max(size.photoSm, size.touchMin),
      minHeight: Math.max(size.photoSm, size.touchMin),
      gap: space[1],
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
    pressed: { opacity: 0.6 },
    banner: { marginBottom: space[3] },
    submit: {
      marginTop: space[3],
      marginBottom: space[8],
    },
  });
}
