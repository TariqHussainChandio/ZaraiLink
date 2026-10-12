import { zodResolver } from '@hookform/resolvers/zod';
import { ImagePlus, Send } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Banner, Button, useToast } from '../../components';
import {
  ListingFormFields,
  listingFormDefaults,
  listingSchema,
  type ListingFormInput,
  type ListingFormValues,
} from '../components/ListingFormFields';
import { useCreateListing } from '../hooks/marketplace';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';
import { pickPhotos, type PickedPhoto } from '../../../utils/photoPicker';
import type { MarketplaceScreenProps } from '../../../navigation/stacks/MarketplaceNavigator';
import { errorMessage } from '../../../utils/errorMessage';

export function CreateListingScreen({
  navigation,
}: MarketplaceScreenProps<'CreateListing'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const [images, setImages] = useState<PickedPhoto[]>([]);
  const createListing = useCreateListing();
  const toast = useToast();
  // Form problems stay on the screen (and are announced) until fixed; a toast could vanish before it is read.
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ListingFormInput, any, ListingFormValues>({
    resolver: zodResolver(listingSchema),
    defaultValues: listingFormDefaults,
  });

  const pickImages = async () => {
    const assets = await pickPhotos({ selectionLimit: 5 });
    if (assets.length > 0) {
      setImages(assets);
      setPhotoError(null);
    }
  };

  const onSubmit = async (values: ListingFormValues) => {
    if (!userId) return;
    if (images.length === 0) {
      setPhotoError('Add at least one photo of your produce.');
      return;
    }

    setSubmitError(null);
    try {
      await createListing.mutateAsync({
        userId,
        images,
        input: {
          ...values,
          description: values.description ?? '',
          brand: values.brand || null,
          condition: values.condition || null,
        },
      });
      toast.success('Listing published');
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
      <ListingFormFields
        control={control}
        errors={errors}
        setValue={setValue}
        watch={watch}
      />

      <Text style={styles.label}>Photos</Text>
      <View style={styles.imageRow}>
        {images.map((image, index) => (
          <Image
            key={image.uri ?? index}
            source={{ uri: image.uri }}
            style={styles.thumbnail}
            accessibilityRole="image"
            accessibilityLabel={`Photo ${index + 1}`}
          />
        ))}
        <TouchableOpacity
          style={styles.addImage}
          onPress={pickImages}
          accessibilityRole="button"
          accessibilityLabel={
            images.length > 0 ? 'Change photos' : 'Add photos'
          }
        >
          <ImagePlus color={theme.colors.ink2} size={theme.size.iconMd} />
          <Text style={styles.addImageLabel}>Add</Text>
        </TouchableOpacity>
      </View>
      {photoError ? (
        <Text
          style={styles.fieldError}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {photoError}
        </Text>
      ) : null}

      {submitError ? (
        <View style={styles.submitError}>
          <Banner tone="danger" title="Listing not published">
            {submitError}
          </Banner>
        </View>
      ) : null}

      <Button
        label="Publish Listing"
        icon={Send}
        loading={createListing.isPending}
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
    label: {
      ...typography.caption,
      color: colors.ink2,
      marginBottom: space[1],
    },
    imageRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space[2],
      marginBottom: space[6],
    },
    thumbnail: {
      width: size.photoMd,
      height: size.photoMd,
      borderRadius: radius.sm,
      backgroundColor: colors.line,
    },
    addImage: {
      width: size.photoMd,
      height: size.photoMd,
      borderRadius: radius.sm,
      borderWidth: borders.hairline,
      borderColor: colors.line,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
    },
    fieldError: {
      ...typography.caption,
      color: colors.status.danger.ink,
      marginTop: -space[4],
      marginBottom: space[4],
    },
    submitError: {
      marginBottom: space[3],
    },
    addImageLabel: {
      color: colors.ink2,
      ...typography.caption,
    },
    submit: {
      marginBottom: space[8],
    },
  });
}
