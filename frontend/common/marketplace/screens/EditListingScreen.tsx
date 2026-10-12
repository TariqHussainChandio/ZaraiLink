import { zodResolver } from '@hookform/resolvers/zod';
import { ImagePlus, Save, Trash2 } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Banner,
  Button,
  ScreenState,
  Sheet,
  SkeletonList,
  useToast,
} from '../../components';
import {
  ListingFormFields,
  listingFormDefaults,
  listingSchema,
  type ListingFormInput,
  type ListingFormValues,
} from '../components/ListingFormFields';
import {
  useDeleteListing,
  useListing,
  useUpdateListing,
} from '../hooks/marketplace';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';
import { pickPhotos, type PickedPhoto } from '../../../utils/photoPicker';
import type { MarketplaceScreenProps } from '../../../navigation/stacks/MarketplaceNavigator';
import { errorMessage } from '../../../utils/errorMessage';

export function EditListingScreen({
  route,
  navigation,
}: MarketplaceScreenProps<'EditListing'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { listingId } = route.params;
  const userId = useAuthStore(state => state.user?.id);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [newImages, setNewImages] = useState<PickedPhoto[]>([]);
  const listingQuery = useListing(listingId);
  const { data: listing, isFetching, isFetchedAfterMount } = listingQuery;
  // A listing can be on screen from the cache (persisted for a day) while the current copy is still on its way. The form
  // is filled from the current copy, or from the cached one when the request failed (offline), never from a stale copy
  // that is about to be replaced: saving it would overwrite a newer price or quantity.
  const waitingForCurrent = !isFetchedAfterMount && isFetching;
  const updateListing = useUpdateListing();
  const deleteListing = useDeleteListing();
  const toast = useToast();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // A save that failed stays on the screen until the next try; a toast could vanish before it is read.
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, dirtyFields },
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
      inventoryProductId: listing.inventory_product_id ?? null,
    });
    setExistingImages(listing.images);
  }, [listing, waitingForCurrent, reset]);

  const pickImages = async () => {
    const assets = await pickPhotos({ selectionLimit: 5 });
    if (assets.length > 0) setNewImages(assets);
  };

  const onSubmit = async (values: ListingFormValues) => {
    if (!userId) return;
    setSubmitError(null);
    const { inventoryProductId, ...fields } = values;
    try {
      await updateListing.mutateAsync({
        id: listingId,
        userId,
        newImages,
        existingImages,
        input: {
          ...fields,
          description: values.description ?? '',
          brand: values.brand || null,
          condition: values.condition || null,
          // D8: the product link is sent only when the seller changed it here (a product, or None to clear it). Left out,
          // the server keeps the link as it is, so saving a new price never undoes a link the dealer set meanwhile from
          // their inventory, and a seller who has no picker never sends one.
          ...(dirtyFields.inventoryProductId ? { inventoryProductId } : {}),
        },
      });
      toast.success('Changes saved');
      navigation.goBack();
    } catch (err) {
      setSubmitError(errorMessage(err));
    }
  };

  // Confirmed in the Sheet below: deleting cannot be undone.
  const onConfirmDelete = async () => {
    try {
      await deleteListing.mutateAsync(listingId);
      setConfirmingDelete(false);
      toast.success('Listing deleted');
      navigation.popToTop();
    } catch (err) {
      setConfirmingDelete(false);
      toast.error(errorMessage(err));
    }
  };

  // A skeleton while loading (or while a cached copy is being replaced by the current one), an error Banner with
  // Retry if the load failed with nothing cached, "not found" if the listing is gone.
  const skeleton = (
    <View style={styles.content}>
      <SkeletonList count={5} />
    </View>
  );
  if (!listing) {
    return (
      <View style={styles.container}>
        <ScreenState
          query={listingQuery}
          skeleton={skeleton}
          empty={{
            title: 'Listing not found',
            description: 'It may have been removed.',
          }}
          errorTitle="Couldn't load this listing"
        />
      </View>
    );
  }
  if (waitingForCurrent)
    return <View style={styles.container}>{skeleton}</View>;

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
        {existingImages.map((uri, index) => (
          <Image
            key={uri}
            source={{ uri }}
            style={styles.thumbnail}
            accessibilityRole="image"
            accessibilityLabel={`Photo ${index + 1}`}
          />
        ))}
        {newImages.map((image, index) => (
          <Image
            key={image.uri ?? index}
            source={{ uri: image.uri }}
            style={styles.thumbnail}
            accessibilityRole="image"
            accessibilityLabel={`New photo ${index + 1}`}
          />
        ))}
        <TouchableOpacity
          style={styles.addImage}
          onPress={pickImages}
          accessibilityRole="button"
          accessibilityLabel="Add photos"
        >
          <ImagePlus color={theme.colors.ink2} size={theme.size.iconMd} />
          <Text style={styles.addImageLabel}>Add</Text>
        </TouchableOpacity>
      </View>

      {submitError ? (
        <Banner tone="danger" title="Changes not saved">
          {submitError}
        </Banner>
      ) : null}

      <Button
        label="Save Changes"
        icon={Save}
        loading={updateListing.isPending}
        onPress={handleSubmit(onSubmit)}
        style={styles.submit}
      />
      <Button
        label="Delete Listing"
        icon={Trash2}
        variant="danger"
        onPress={() => setConfirmingDelete(true)}
        style={styles.delete}
      />

      <Sheet
        visible={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        title="Delete this listing?"
      >
        <Text style={styles.sheetText}>
          {"Buyers will no longer see it. This can't be undone."}
        </Text>
        <Button
          label="Delete"
          icon={Trash2}
          variant="danger"
          loading={deleteListing.isPending}
          onPress={onConfirmDelete}
          style={styles.sheetAction}
        />
        <Button
          label="Keep listing"
          variant="secondary"
          onPress={() => setConfirmingDelete(false)}
          style={styles.sheetAction}
        />
      </Sheet>
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
    addImageLabel: {
      color: colors.ink2,
      ...typography.caption,
    },
    submit: {
      marginTop: space[2],
    },
    sheetText: {
      ...typography.body,
      color: colors.ink2,
    },
    sheetAction: {
      marginTop: space[2],
    },
    delete: {
      marginTop: space[3],
      marginBottom: space[8],
    },
  });
}
