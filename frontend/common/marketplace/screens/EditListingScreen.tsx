import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button, EmptyState, Spinner } from '../../components';
import {
  ListingFormFields,
  listingFormDefaults,
  listingSchema,
  type ListingFormInput,
  type ListingFormValues,
} from '../components/ListingFormFields';
import { useDeleteListing, useListing, useUpdateListing } from '../hooks/marketplace';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';
import { pickPhotos, type PickedPhoto } from '../../../utils/photoPicker';
import type { MarketplaceScreenProps } from '../../../navigation/stacks/MarketplaceNavigator';
import { errorMessage } from '../../../utils/errorMessage';

export function EditListingScreen({ route, navigation }: MarketplaceScreenProps<'EditListing'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { listingId } = route.params;
  const userId = useAuthStore(state => state.user?.id);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [newImages, setNewImages] = useState<PickedPhoto[]>([]);
  const { data: listing, isPending, isFetching, isFetchedAfterMount, error, refetch } = useListing(listingId);
  // A listing can be on screen from the cache (persisted for a day) while the current copy is still on its way. The form
  // is filled from the current copy, or from the cached one when the request failed (offline), never from a stale copy
  // that is about to be replaced: saving it would overwrite a newer price or quantity.
  const waitingForCurrent = !isFetchedAfterMount && isFetching;
  const updateListing = useUpdateListing();
  const deleteListing = useDeleteListing();

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

  // Fill the form once. A later background refetch must not overwrite what the seller has already typed.
  const filled = useRef(false);
  useEffect(() => {
    if (!listing || filled.current || waitingForCurrent) return;
    filled.current = true;
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
  }, [listing, waitingForCurrent, reset]);

  const pickImages = async () => {
    const assets = await pickPhotos({ selectionLimit: 5 });
    if (assets.length > 0) setNewImages(assets);
  };

  const onSubmit = async (values: ListingFormValues) => {
    if (!userId) return;
    try {
      await updateListing.mutateAsync({
        id: listingId,
        userId,
        newImages,
        existingImages,
        input: {
          ...values,
          description: values.description ?? '',
          brand: values.brand || null,
          condition: values.condition || null,
        },
      });
      navigation.goBack();
    } catch (err) {
      Alert.alert('Failed to update listing', errorMessage(err));
    }
  };

  const onDelete = () => {
    Alert.alert('Delete listing', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteListing.mutateAsync(listingId);
            navigation.popToTop();
          } catch (err) {
            Alert.alert('Could not delete the listing', errorMessage(err));
          }
        },
      },
    ]);
  };

  if (isPending || waitingForCurrent) return <Spinner fullscreen />;
  if (error && !listing) {
    return (
      <EmptyState
        title="Couldn't load this listing"
        description="Check your connection and try again."
        actionLabel="Retry"
        onAction={() => refetch()}
      />
    );
  }

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

      <Button
        label="Save Changes"
        loading={updateListing.isPending}
        onPress={handleSubmit(onSubmit)}
        style={styles.submit}
      />
      <Button
        label="Delete Listing"
        variant="danger"
        onPress={onDelete}
        style={styles.delete}
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
    addImageLabel: {
      color: colors.ink2,
      ...typography.caption,
    },
    submit: {
      marginTop: space[2],
    },
    delete: {
      marginTop: space[3],
      marginBottom: space[8],
    },
  });
}
