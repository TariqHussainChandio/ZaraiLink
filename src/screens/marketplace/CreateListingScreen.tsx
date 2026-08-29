import { zodResolver } from '@hookform/resolvers/zod';
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { launchImageLibrary, type Asset } from 'react-native-image-picker';
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button } from '../../components/ui';
import {
  ListingFormFields,
  listingFormDefaults,
  listingSchema,
  type ListingFormValues,
} from '../../components/features/marketplace/ListingFormFields';
import { createListing, uploadListingImages } from '../../services/modules/marketplace/listingsService';
import { useAuthStore } from '../../store/authStore';
import { lightTheme } from '../../theme';
import type { MarketplaceScreenProps } from '../../navigation/stacks/MarketplaceNavigator';

const { colors, spacing, radii, typography } = lightTheme;

export function CreateListingScreen({ navigation }: MarketplaceScreenProps<'CreateListing'>) {
  const userId = useAuthStore(state => state.user?.id);
  const [images, setImages] = useState<Asset[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ListingFormValues>({
    resolver: zodResolver(listingSchema),
    defaultValues: listingFormDefaults,
  });

  const pickImages = async () => {
    const result = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 5 });
    if (result.assets) setImages(result.assets);
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
    backgroundColor: colors.neutral.gray100,
  },
  addImage: {
    width: 72,
    height: 72,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.neutral.gray300,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addImageLabel: {
    color: colors.neutral.gray500,
    fontSize: typography.sizes.xs,
  },
  submit: {
    marginBottom: spacing['2xl'],
  },
});
