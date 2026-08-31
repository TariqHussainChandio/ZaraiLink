import { zodResolver } from '@hookform/resolvers/zod';
import React, { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { Asset } from 'react-native-image-picker';
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button } from '../../components/ui';
import {
  ListingFormFields,
  listingFormDefaults,
  listingSchema,
  type ListingFormInput,
  type ListingFormValues,
} from '../../components/features/marketplace/ListingFormFields';
import { createListing, uploadListingImages } from '../../services/modules/marketplace/listingsService';
import { useAuthStore } from '../../store/authStore';
import { useTheme, type Theme } from '../../theme';
import { pickPhotos } from '../../utils/photoPicker';
import type { MarketplaceScreenProps } from '../../navigation/stacks/MarketplaceNavigator';

export function CreateListingScreen({ navigation }: MarketplaceScreenProps<'CreateListing'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const [images, setImages] = useState<Asset[]>([]);
  const [submitting, setSubmitting] = useState(false);

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
    if (assets.length > 0) setImages(assets);
  };

  const onSubmit = async (values: ListingFormValues) => {
    if (!userId) return;
    if (images.length === 0) {
      Alert.alert('Add a photo', 'Please add at least one image of your produce.');
      return;
    }

    setSubmitting(true);
    try {
      const imageUrls = await uploadListingImages(userId, images);
      await createListing({
        ...values,
        description: values.description ?? '',
        brand: values.brand || null,
        condition: values.condition || null,
        images: imageUrls,
      });
      navigation.goBack();
    } catch (error) {
      Alert.alert('Failed to create listing', error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ListingFormFields control={control} errors={errors} setValue={setValue} watch={watch} />

      <Text style={styles.label}>Photos</Text>
      <View style={styles.imageRow}>
        {images.map((image, index) => (
          <Image key={image.uri ?? index} source={{ uri: image.uri }} style={styles.thumbnail} />
        ))}
        <TouchableOpacity style={styles.addImage} onPress={pickImages}>
          <Text style={styles.addImageLabel}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <Button label="Publish Listing" loading={submitting} onPress={handleSubmit(onSubmit)} style={styles.submit} />
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
      marginBottom: spacing.xs,
    },
    imageRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginBottom: spacing.xl,
    },
    thumbnail: {
      width: 72,
      height: 72,
      borderRadius: radii.md,
      backgroundColor: colors.border,
    },
    addImage: {
      width: 72,
      height: 72,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
    },
    addImageLabel: {
      color: colors.text.secondary,
      fontSize: typography.sizes.xs,
    },
    submit: {
      marginBottom: spacing['2xl'],
    },
  });
}
