import { zodResolver } from '@hookform/resolvers/zod';
import type { NavigationAction } from '@react-navigation/native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert, StyleSheet, View } from 'react-native';
import { Button, ConfirmSheet, QueryState, ScreenScaffold, StickyActionBar, useSnackbar } from '../../components';
import { ListingFormFields, listingFormDefaults, listingSchema, type ListingFormInput, type ListingFormValues } from '../components/ListingFormFields';
import { ListingPhotos, MAX_LISTING_PHOTOS } from '../components/ListingPhotos';
import { useDeleteListing, useListing, useUpdateListing } from '../hooks/marketplace';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';
import { pickPhotos, type PickedPhoto } from '../../../utils/photoPicker';
import type { MarketplaceScreenProps } from '../../../navigation/stacks/MarketplaceNavigator';
import { errorMessage } from '../../../utils/errorMessage';

const NO_PHOTO = 'Keep at least one photo so buyers can see what you sell';

/** Edit or delete one of your listings. The form fills from the current copy of the listing (never a cached one about to
 * be replaced), photos can be removed and added, and leaving with unsaved changes asks first. */
export function EditListingScreen({ route, navigation }: MarketplaceScreenProps<'EditListing'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { listingId } = route.params;
  const userId = useAuthStore(state => state.user?.id);
  const snackbar = useSnackbar();
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [newImages, setNewImages] = useState<PickedPhoto[]>([]);
  const [photoError, setPhotoError] = useState<string | undefined>();
  const [discarding, setDiscarding] = useState<NavigationAction | null>(null);
  const [deleting, setDeleting] = useState(false);
  const query = useListing(listingId);
  const { data: listing, isFetching, isFetchedAfterMount } = query;
  // A listing can be on screen from the cache (persisted for a day) while the current copy is still on its way. The form
  // is filled from the current copy, or from the cached one when the request failed (offline), never from a stale copy
  // that is about to be replaced: saving it would overwrite a newer price or quantity.
  const waitingForCurrent = !isFetchedAfterMount && isFetching;
  const updateListing = useUpdateListing();
  const deleteListing = useDeleteListing();
  const done = useRef(false);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isDirty },
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
      // Money and quantities are whole numbers in the app; the boxes hold their digits.
      price: String(Math.round(listing.price)),
      unit: listing.unit,
      quantity: String(Math.round(listing.quantity)),
      brand: listing.brand ?? '',
      condition: listing.condition ?? '',
      cropCompatibility: listing.crop_compatibility,
      country: listing.location?.country ?? null,
      province: listing.location?.province ?? null,
      city: listing.location?.city ?? null,
    });
    setExistingImages(listing.images);
  }, [listing, waitingForCurrent, reset]);

  const photoCount = existingImages.length + newImages.length;
  const photosChanged = listing ? newImages.length > 0 || existingImages.length !== listing.images.length : false;
  const unsaved = isDirty || photosChanged;
  useEffect(
    () =>
      navigation.addListener('beforeRemove', event => {
        if (done.current || !unsaved) return;
        event.preventDefault();
        setDiscarding(event.data.action);
      }),
    [navigation, unsaved],
  );

  const pickImages = async () => {
    const assets = await pickPhotos({ selectionLimit: MAX_LISTING_PHOTOS - photoCount });
    if (assets.length === 0) return;
    setNewImages(current => [...current, ...assets].slice(0, MAX_LISTING_PHOTOS - existingImages.length));
    setPhotoError(undefined);
  };

  const removePhoto = (index: number) => {
    if (index < existingImages.length) setExistingImages(current => current.filter((_, i) => i !== index));
    else setNewImages(current => current.filter((_, i) => i !== index - existingImages.length));
  };

  const onSubmit = async (values: ListingFormValues) => {
    if (!userId) return;
    if (photoCount === 0) {
      setPhotoError(NO_PHOTO);
      return;
    }
    try {
      await updateListing.mutateAsync({
        id: listingId,
        userId,
        newImages,
        existingImages,
        input: { ...values, description: values.description ?? '', brand: values.brand || null, condition: values.condition || null },
      });
      done.current = true;
      snackbar.show('Changes saved');
      navigation.goBack();
    } catch (err) {
      Alert.alert("Couldn't save the changes", errorMessage(err));
    }
  };

  const submit = () =>
    handleSubmit(onSubmit, () => {
      if (photoCount === 0) setPhotoError(NO_PHOTO);
    })();

  const ready = listing !== undefined && !waitingForCurrent;

  return (
    <>
      <ScreenScaffold
        footer={
          ready ? (
            <StickyActionBar>
              <Button label="Save changes" size="lg" loading={updateListing.isPending} onPress={submit} />
            </StickyActionBar>
          ) : undefined
        }
      >
        {/* While the current copy is on its way the cached one is not shown, so the screen reads as loading. */}
        <QueryState query={waitingForCurrent ? { ...query, isPending: true, data: undefined } : query} failureTitle="Couldn't load this listing">
          <ListingPhotos
            uris={[...existingImages, ...newImages.map(image => image.uri)]}
            onAdd={pickImages}
            onRemove={removePhoto}
            error={photoError}
            disabled={updateListing.isPending}
          />
          <ListingFormFields control={control} errors={errors} setValue={setValue} watch={watch} />
          <View style={styles.danger}>
            <Button label="Delete listing" variant="danger" onPress={() => setDeleting(true)} />
          </View>
        </QueryState>
      </ScreenScaffold>
      <ConfirmSheet
        visible={discarding !== null}
        onClose={() => setDiscarding(null)}
        title="Discard your changes?"
        message="The changes you made to this listing will be lost."
        confirmLabel="Discard changes"
        keepLabel="Keep editing"
        destructive
        onConfirm={() => {
          const action = discarding;
          done.current = true;
          if (action) navigation.dispatch(action);
        }}
      />
      <ConfirmSheet
        visible={deleting}
        onClose={() => setDeleting(false)}
        title="Delete this listing?"
        message="It is removed from the market and can't be brought back."
        confirmLabel="Delete listing"
        keepLabel="Keep listing"
        destructive
        onConfirm={async () => {
          await deleteListing.mutateAsync(listingId);
          done.current = true;
          snackbar.show('Listing deleted');
          navigation.popToTop();
        }}
      />
    </>
  );
}

function makeStyles({ space }: Theme) {
  return StyleSheet.create({
    danger: { marginBottom: space[4] },
  });
}
