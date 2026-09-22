import { zodResolver } from '@hookform/resolvers/zod';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button, EmptyState, Spinner } from '../../components/ui';
import {
  ListingFormFields,
  listingFormDefaults,
  listingSchema,
  type ListingFormInput,
  type ListingFormValues,
} from '../../components/features/marketplace/ListingFormFields';
import {
  deleteListing,
  fetchListingById,
  updateListing,
  uploadListingImages,
} from '../../services/modules/marketplace/listingsService';
import { useAuthStore } from '../../store/authStore';
import { useTheme, type Theme } from '../../theme';
import { pickPhotos, type PickedPhoto } from '../../utils/photoPicker';
import type { MarketplaceScreenProps } from '../../navigation/stacks/MarketplaceNavigator';

export function EditListingScreen({ route, navigation }: MarketplaceScreenProps<'EditListing'>) {
  const theme = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { listingId } = route.params;
  const userId = useAuthStore(state => state.user?.id);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [newImages, setNewImages] = useState<PickedPhoto[]>([]);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ListingFormInput, any, ListingFormValues>({
    resolver: zodResolver(listingSchema),
    defaultValues: listingFormDefaults,
  });

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
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
          country: listing.location?.country ?? null,
          province: listing.location?.province ?? null,
          city: listing.location?.city ?? null,
        });
        setExistingImages(listing.images);
      })
      .catch(err => {
        console.warn('[EditListingScreen] failed to load listing:', err);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [listingId, reset]);

  useEffect(() => {
    load();
  }, [load]);

  const pickImages = async () => {
    const assets = await pickPhotos({ selectionLimit: 5 });
    if (assets.length > 0) setNewImages(assets);
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
    } catch (err) {
      Alert.alert(
        t('marketplace.editListing.failedTitle'),
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = () => {
    Alert.alert(t('marketplace.editListing.deleteConfirmTitle'), t('marketplace.editListing.deleteConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('marketplace.editListing.deleteConfirmButton'),
        style: 'destructive',
        onPress: async () => {
          await deleteListing(listingId);
          navigation.popToTop();
        },
      },
    ]);
  };

  if (loading) return <Spinner fullscreen />;
  if (error) {
    return (
      <EmptyState
        title={t('marketplace.editListing.loadErrorTitle')}
        description={t('marketplace.editListing.loadErrorDescription')}
        actionLabel={t('common.retry')}
        onAction={load}
      />
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ListingFormFields control={control} errors={errors} setValue={setValue} watch={watch} />

      <Text style={styles.label}>{t('marketplace.editListing.photosLabel')}</Text>
      <View style={styles.imageRow}>
        {existingImages.map(uri => (
          <Image key={uri} source={{ uri }} style={styles.thumbnail} />
        ))}
        {newImages.map((image, index) => (
          <Image key={image.uri ?? index} source={{ uri: image.uri }} style={styles.thumbnail} />
        ))}
        <TouchableOpacity style={styles.addImage} onPress={pickImages}>
          <Text style={styles.addImageLabel}>{t('marketplace.editListing.addImageLabel')}</Text>
        </TouchableOpacity>
      </View>

      <Button
        label={t('marketplace.editListing.saveChangesLabel')}
        loading={submitting}
        onPress={handleSubmit(onSubmit)}
        style={styles.submit}
      />
      <Button
        label={t('marketplace.editListing.deleteListingLabel')}
        variant="destructive"
        onPress={onDelete}
        style={styles.delete}
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
      marginTop: spacing.sm,
    },
    delete: {
      marginTop: spacing.md,
      marginBottom: spacing['2xl'],
    },
  });
}
