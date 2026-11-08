import { zodResolver } from '@hookform/resolvers/zod';
import { ImagePlus, X } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';
import {
  Banner,
  Button,
  ChipRow,
  ScreenScaffold,
  SelectField,
  StickyActionBar,
  TextField,
  useSnackbar,
} from '../../components';
import { useRequestConsultation } from '../hooks/consultations';
import { useAuthStore } from '../../../state/authStore';
import { useFarms } from '../../../farmer';
import { useCrops } from '../../marketplace';
import { useExpertProfile, type ConsultationPriority } from '../../../expert';
import { useTheme, type Theme } from '../../../theme';
import { pickPhotos, type PickedPhoto } from '../../../utils/photoPicker';
import { CONSULTATIONS_ROUTES } from '../../constants/routes';
import type { ConsultationsScreenProps } from '../../../navigation/stacks/ConsultationsNavigator';
import { errorMessage } from '../../../utils/errorMessage';

const MAX_PHOTOS = 4;

const PRIORITY_OPTIONS: { value: ConsultationPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

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

/** Asks one expert for help. The words in "Describe the problem" are the person's own: a plant scan's description is
 * never put there (BR-13, FA-09); only its crop and photo come along, and both can be changed. */
export function RequestConsultationScreen({ route, navigation }: ConsultationsScreenProps<'RequestConsultation'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const snackbar = useSnackbar();
  const { expertId, prefill } = route.params;
  const userId = useAuthStore(state => state.user?.id);
  const { data: crops = [] } = useCrops();
  const { data: farms = [] } = useFarms(!!userId);
  const { data: expertProfile } = useExpertProfile(expertId);
  // A disease-advisory handoff seeds this with the case's already-uploaded remote image —
  // `uploadConsultationAttachments` just does `fetch(image.uri)`, which works the same for a
  // remote `https://` URL as for a local picker `file://` URI, so no service changes needed.
  const [images, setImages] = useState<PickedPhoto[]>(
    prefill?.imageUrl
      ? [
          {
            uri: prefill.imageUrl,
            fileName: 'disease-photo.jpg',
            mimeType: 'image/jpeg',
          },
        ]
      : [],
  );
  const [failure, setFailure] = useState<string | null>(null);
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
      problemDescription: '',
      farmId: null,
      priority: 'medium',
    },
  });

  // Photos add to the ones already chosen (the scan's photo included); a cancelled picker adds nothing.
  const addPhotos = async () => {
    const picked = await pickPhotos({
      selectionLimit: MAX_PHOTOS - images.length,
    });
    if (picked.length > 0) setImages(current => [...current, ...picked].slice(0, MAX_PHOTOS));
  };
  const removePhoto = (uri: string) => setImages(current => current.filter(image => image.uri !== uri));

  const expertName = expertProfile?.expert.profile?.full_name;

  const onSubmit = async (values: RequestFormValues) => {
    if (!userId) return;
    setFailure(null);
    try {
      const { consultation, photosFailed } = await requestConsultation.mutateAsync({
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
      // The request exists now. Say so, and open the case: from there the photos can be sent again, and nobody sends the
      // request twice for fear it was lost.
      snackbar.show(
        photosFailed
          ? 'Request sent, but the photos did not upload. Send them in the case.'
          : expertName
            ? `Request sent to ${expertName}`
            : 'Request sent',
      );
      navigation.replace(CONSULTATIONS_ROUTES.ConsultationDetail, {
        consultationId: consultation.id,
      });
    } catch (error) {
      setFailure(errorMessage(error));
    }
  };

  const sending = requestConsultation.isPending;

  return (
    <ScreenScaffold
      footer={
        <StickyActionBar>
          <Button label="Send request" size="lg" loading={sending} onPress={handleSubmit(onSubmit)} />
        </StickyActionBar>
      }
    >
      {failure ? (
        <Banner tone="danger" title="Couldn't send your request">
          {failure}
        </Banner>
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
            helper="What do you see? Since when?"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        )}
      />

      <View>
        <Text style={styles.label}>How urgent is it?</Text>
        <Controller
          control={control}
          name="priority"
          render={({ field: { onChange, value } }) => (
            <ChipRow options={PRIORITY_OPTIONS} value={value} onChange={onChange} wrap />
          )}
        />
      </View>

      <View>
        <Text style={styles.label}>Photos (optional)</Text>
        {images.length > 0 ? (
          <View style={styles.imageRow}>
            {images.map((image, index) => (
              <View key={image.uri} style={styles.thumbWrap}>
                <Image
                  source={{ uri: image.uri }}
                  style={styles.thumb}
                  accessibilityLabel={`Photo ${index + 1} of ${images.length}`}
                />
                <Pressable
                  style={styles.remove}
                  onPress={() => removePhoto(image.uri)}
                  hitSlop={theme.components.hitSlop(theme.size.countBadge)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove photo ${index + 1}`}
                >
                  <X size={theme.size.iconSm} color={theme.colors.onAccent} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        {images.length < MAX_PHOTOS ? (
          <Button label="Add photo" variant="secondary" icon={ImagePlus} fullWidth={false} onPress={addPhotos} />
        ) : null}
      </View>
    </ScreenScaffold>
  );
}

function makeStyles({ colors, space, radius, typography, size }: Theme) {
  return StyleSheet.create({
    label: { ...typography.label, color: colors.ink, marginBottom: space[2] },
    imageRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space[3],
      marginBottom: space[3],
    },
    thumbWrap: { width: size.photoMd, height: size.photoMd },
    thumb: {
      width: size.photoMd,
      height: size.photoMd,
      borderRadius: radius.sm,
      backgroundColor: colors.surfaceSunken,
    },
    remove: {
      position: 'absolute',
      top: -space[1],
      right: -space[1],
      width: size.countBadge,
      height: size.countBadge,
      borderRadius: radius.pill,
      backgroundColor: colors.ink2,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
