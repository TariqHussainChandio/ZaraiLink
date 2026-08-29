import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { launchImageLibrary, type Asset } from 'react-native-image-picker';
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button, Spinner } from '../../components/ui';
import {
  ListingFormFields,
  listingFormDefaults,
  listingSchema,
  type ListingFormValues,
} from '../../components/features/marketplace/ListingFormFields';
import {
  deleteListing,
  fetchListingById,
  updateListing,
  uploadListingImages,
} from '../../services/modules/marketplace/listingsService';
import { useAuthStore } from '../../store/authStore';
import { lightTheme } from '../../theme';
import type { MarketplaceScreenProps } from '../../navigation/stacks/MarketplaceNavigator';

const { colors, spacing, radii, typography } = lightTheme;

export function EditListingScreen({ route, navigation }: MarketplaceScreenProps<'EditListing'>) {
  const { listingId } = route.params;
  const userId = useAuthStore(state => state.user?.id);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [newImages, setNewImages] = useState<Asset[]>([]);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ListingFormValues>({
    resolver: zodResolver(listingSchema),
    defaultValues: listingFormDefaults,
  });

  useEffect(() => {
    fetchListingById(listingId)
      .then(listing => {
        reset({
          title: listing.title,
          description: listing.description ?? '',
          categoryId: listing.category_id,
          price: listing.price,
          unit: listing.unit,
          quantity: listing.quantity,
          brand: listing.brand ?? '',
          condition: listing.condition ?? '',
          cropCompatibility: listing.crop_compatibility,
          countryId: listing.location?.country_id ?? null,
          provinceId: listing.location?.province_id ?? null,
          cityId: listing.location?.city_id ?? null,
        });
        setExistingImages(listing.images);
      })
      .catch(err => {
        console.warn('[EditListingScreen] failed to load listing:', err);
      })
      .finally(() => setLoading(false));
  }, [listingId, reset]);

  const pickImages = async () => {
    const result = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 5 });
    if (result.assets) setNewImages(result.assets);
  };

  const onSubmit = async (values: ListingFormValues) => {
    if (!userId) return;
    setSubmitting(true);
    try {
      const uploaded = newImages.length > 0 ? await uploadListingImages(userId, newImages) : [];
      await updateListing(listingId, {
        ...values,
        description: values.description ?? '',
        brand: values.brand || null,
        condition: values.condition || null,
        images: [...existingImages, ...uploaded],
      });
      navigation.goBack();
    } catch (error) {
      Alert.alert('Failed to update listing', error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = () => {
    Alert.alert('Delete listing', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteListing(listingId);
          navigation.popToTop();
        },
      },
    ]);
  };

  if (loading) return <Spinner fullscreen />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ListingFormFields control={control} errors={errors} setValue={setValue} watch={watch} />

      <Text style={styles.label}>Photos</Text>
      <View style={styles.imageRow}>
        {existingImages.map(uri => (
          <Image key={uri} source={{ uri }} style={styles.thumbnail} />
        ))}
        {newImages.map((image, index) => (
          <Image key={image.uri ?? index} source={{ uri: image.uri }} style={styles.thumbnail} />
        ))}
        <TouchableOpacity style={styles.addImage} onPress={pickImages}>
          <Text style={styles.addImageLabel}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <Button label="Save Changes" loading={submitting} onPress={handleSubmit(onSubmit)} style={styles.submit} />
      <Button label="Delete Listing" variant="destructive" onPress={onDelete} style={styles.delete} />
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
    marginTop: spacing.sm,
  },
  delete: {
    marginTop: spacing.md,
    marginBottom: spacing['2xl'],
  },
});
